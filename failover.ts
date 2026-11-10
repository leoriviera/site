import { writeFile, rm, mkdir } from "node:fs/promises";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname } from "node:path";
import { workerData } from "node:worker_threads";
import { create } from "tar";

import { generateResponse, loadTemplate } from "./common";
import { OutlineDocumentContent, WorkerData } from "./types";
import { fetchPageContent, getDocuments } from "./utils";
import { getSampleData, fetchSamplePageContent } from "./sample";

let backingUp = false;

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

    if (isProd) {
      console.info("In production. Uploading failover site to surge.sh");
    }

    // TODO - handle surge.sh rate limits
    // According to https://surge.sh/docs/api/deploys,
    // the retry-after header gives the seconds until the window allows
    // another deploy. However, I'm not sure what format that'll come in.
  } catch (error) {
    console.error("error encountered while creating failover backup", {
      error,
    });
  }
};

(async () => {
  // Create gzipped tar archive
  // You definitely want to await on this, otherwise we'll start uploading
  // before the gzip is ready. This is, quite obviously, bad.
  const _stream = await create(
    {
      gzip: true,
      C: tempDirPath,
      prefix: "site",
    },
    ["."],
  );

  const stream = new ReadableStream();

  const response = await fetch(
    `https://surge.surge.sh/${process.env.SURGE_SH_DOMAIN!}`,
    {
      method: "PUT",
      body: _stream,
      headers: {
        Accept: "application/x-ndjson",
        // Authorization: `Basic ${surgeBasicAuth}`,
        "Content-Type": "application/gzip",
      },
      // Apparently the duplex option is required when sending a body.
      // I don't make the rules.
      // https://github.com/nodejs/node/issues/46221#issue-1533888345
      // @ts-ignore
      duplex: "half",
    },
  );
  console.log(response, await response.text());

  return;
})();

setInterval(async () => {
  if (backingUp === true) {
    console.info("Currently already backing up!");
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
