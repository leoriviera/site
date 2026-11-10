import { writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, dirname, basename } from "node:path";
import { workerData } from "node:worker_threads";
import { spawn } from "node:child_process";

import { generateResponse, loadTemplate } from "./common";
import { OutlineDocumentContent, WorkerData } from "./types";
import { fetchPageContent, getDocuments } from "./utils";
import { getSampleData, fetchSamplePageContent } from "./sample";

let backingUp = false;
let retryAt = new Date();

if (workerData === undefined) {
  throw new Error(
    "The failover backup worker has not been supplied with any data. No backups will be created.",
  );
}
const { commit, rootDir } = workerData as WorkerData;

// We always want our dev temp dir at the root!
const isProd = process.env.NODE_ENV! === "production";
const tempDirPath = isProd ? tmpdir() : resolve(rootDir, "./output");
const useSampleData = process.env.USE_SAMPLE_DATA! === "true";
const surgeBasicAuth = Buffer.from(
  `token:${process.env.SURGE_SH_TOKEN!}`,
).toString("base64");

const template = loadTemplate(process.env.TEMPLATE_PATH!);

const createFailoverBackup = async () => {
  try {
    const startTime = new Date().getTime();
    const { data: documents } = useSampleData
      ? await getSampleData()
      : await getDocuments();

    // Add /500 in here! It's a little crude, but it works for now.
    documents["/500"] = {
      id: "",
      title: "500",
      icon: "🔥",
      url: "/500",
    };

    const pages: [string, string][] = await Promise.all(
      Object.entries(documents).map(async ([url, document]) => {
        const pageContent: OutlineDocumentContent | undefined =
          url === "/500"
            ? {
                title: "leo/500",
                icon: document.icon ?? null,
                text: "<p>Something went wrong, and the server failed to render the page.</p><p>Womp womp.</p>",
                updatedAt: "",
              }
            : document
              ? useSampleData
                ? await fetchSamplePageContent(document)
                : await fetchPageContent(document)
              : undefined;

        const { context } = await generateResponse(
          url,
          pageContent,
          documents,
          startTime,
          commit,
          true,
          useSampleData,
        );

        const html = template(context);

        // We don't want some pages to be nested!
        const hardcodedPaths: Record<string, string> = {
          "/index": "/index.html",
          "/404": "/404.html",
          "/500": "/500.html",
        };

        // Add "/index" to every path (in case it has subpages!)
        const encodedPath = (hardcodedPaths[url] ?? `${url}/index.html`)
          .toLowerCase()
          // Remove the slash at the start
          .substring(1);

        return [encodedPath, html];
      }),
    );

    await rm(tempDirPath, {
      force: true,
      recursive: true,
    });

    await Promise.all(
      pages.map(async ([encodedPath, html]) => {
        const writePath = resolve(tempDirPath, encodedPath);
        await mkdir(dirname(writePath), { recursive: true });
        await writeFile(writePath, html);
      }),
    );

    const stream = spawn("tar", ["czf", "-", "-C", tempDirPath, "."], {
      stdio: ["ignore", "pipe", "inherit"],
    });

    const response = await fetch(
      `https://surge.surge.sh/${process.env.SURGE_SH_DOMAIN!}`,
      {
        method: "PUT",
        // This... works. Let's just ship it.
        // @ts-ignore
        body: stream.stdout,
        headers: {
          Accept: "application/x-ndjson",
          Authorization: `Basic ${surgeBasicAuth}`,
          "Content-Type": "application/gzip",
          message: `Failover generated at ${new Date(startTime).toISOString()}`,
        },
        // Apparently the duplex option is required when sending a body.
        // I don't make the rules.
        // https://github.com/nodejs/node/issues/46221#issue-1533888345
        // @ts-ignore
        duplex: "half",
      },
    );

    if (response.status === 429) {
      const date = new Date(response.headers.get("date") as string);
      const retryAfter = Number(response.headers.get("retry-after") as string);
      date.setSeconds(date.getSeconds() + retryAfter);
      retryAt = date;
      console.error(
        `Uploads have been rate-limited. Retrying after ${retryAt.toISOString()}`,
      );
      return;
    }

    const text = await response.text();

    if (!response.ok) {
      throw new Error(text);
    }

    const splitResponse = text.trim().split("\n");
    const responseLastLine = splitResponse[splitResponse.length - 1];
    if (responseLastLine === "Failed to stream") {
      throw new Error("Failed to stream body to surge.sh");
    }

    if (responseLastLine?.includes('"type":"info"')) {
      console.info(
        "Successfully deployed to surge.sh!",
        JSON.parse(responseLastLine),
      );
    }

    if (isProd) {
      console.info("In production. Uploading failover site to surge.sh");
    }
  } catch (error) {
    console.error("error encountered while creating failover backup", {
      error,
    });
  }
};

setInterval(async () => {
  if (backingUp === true) {
    console.info("Currently already backing up!");
    return;
  }

  if (retryAt > new Date()) {
    console.info(
      `Currently rate-limited. Waiting until ${retryAt.toISOString()}.`,
    );
    return;
  }

  try {
    backingUp = true;
    await createFailoverBackup();
  } catch (error) {
    console.error("Failed to generate failover backup", {
      error,
    });
  } finally {
    backingUp = false;
  }

  console.log("Backup complete!");
  // Run failover backup every ten minutes...
}, 60_000 * 15);

createFailoverBackup();
