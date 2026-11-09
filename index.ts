import { exec } from "node:child_process";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { Worker } from "node:worker_threads";

import { generateResponse, loadTemplate } from "./common";
import { OutlineDocumentContent, Response } from "./types";
import { fetchPageContent, generateIcons, getDocuments, setEnv } from "./utils";
import { getSampleData, fetchSamplePageContent } from "./sample";

(async () => {
  // Parse env file into process.env, while also defining default environment
  // variables. I've done it like this so I can definitely document what variables
  // I expect, and ensure they have *some* value at runtime.
  await setEnv({
    DISPLAY_FAILOVER_BANNER: "false",
    USE_SAMPLE_DATA: "false",
  });

  const failoverWorker = new Worker(resolve(__dirname, "./failover.ts"), {
    execArgv: ["-r", "tsx/cjs"],
  });

  const port = process.env.PORT || 3000;
  const requiredEnv: { key: string; isSensitive: boolean }[] = [
    {
      key: "OUTLINE_API_KEY",
      isSensitive: true,
    },
    {
      key: "OUTLINE_COLLECTION_ID",
      isSensitive: true,
    },
    {
      key: "OUTLINE_API_HOST",
      isSensitive: false,
    },
    {
      key: "WEBSITE_URL",
      isSensitive: false,
    },
    {
      key: "TEMPLATE_PATH",
      isSensitive: false,
    },
    {
      key: "USE_SAMPLE_DATA",
      isSensitive: false,
    },
    {
      key: "DISPLAY_FAILOVER_BANNER",
      isSensitive: false,
    },
  ];
  const missingEnv = requiredEnv.filter(({ key }) => !process.env[key]);
  if (missingEnv.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missingEnv.join(", ")}`,
    );
  }

  const env = Object.fromEntries(
    requiredEnv.map(({ key, isSensitive }) => [
      key,
      isSensitive ? "*****" : process.env[key],
    ]),
  );

  console.info("Current environment", env);

  const template = loadTemplate(process.env.TEMPLATE_PATH!);
  const displayFailoverBanner = process.env.DISPLAY_FAILOVER_BANNER! === "true";
  const useSampleData = process.env.USE_SAMPLE_DATA! === "true";

  // Get current hash
  const shortHash: string = await new Promise((res, rej) => {
    exec("git rev-parse --short HEAD", (err, out) => {
      if (err) {
        rej(err);
      }
      res(out.trim());
    });
  });

  const commit = `${shortHash}`;
  failoverWorker.postMessage({
    type: "SET_DATA",
    data: {
      commit,
    },
  });

  createServer(async (req, res) => {
    const startTime = new Date().getTime();
    // Default to a 500 page
    const { emoji, favicon } = generateIcons("🔥");
    let response: Response = {
      status: 500,
      context: {
        title: "leo/500",
        emoji,
        favicon,
        html: "<p>Something went wrong, and the server failed to render the page.</p><p>Womp womp.</p>",
        renderTime: new Date().getTime() - startTime,
        commit,
        displayFailoverBanner,
        useSampleData,
      },
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
      options: {
        useTemplate: true,
      },
    };

    try {
      const url =
        req.url === undefined || req.url === "/"
          ? "/index"
          : decodeURI(new URL(req.url, process.env.WEBSITE_URL).pathname);

      if (url !== "/500") {
        const { data: documents } = useSampleData
          ? await getSampleData()
          : await getDocuments();
        const document = documents[url] ?? documents["/404"];

        const pageContent: OutlineDocumentContent | undefined = document
          ? useSampleData
            ? await fetchSamplePageContent(document)
            : await fetchPageContent(document)
          : undefined;

        response = await generateResponse(
          url,
          pageContent,
          documents,
          startTime,
          commit,
          displayFailoverBanner,
          useSampleData,
        );
      }
    } catch (error) {
      console.error(error);
    } finally {
      return res.writeHead(response.status, response.headers).end(
        response.options.useTemplate
          ? // TODO - template render time is, unironically, not included in
            // renderTime. Fix this, idiot.
            template(response.context)
          : response.context,
      );
    }
  }).listen(port, () => {
    console.log(`Listening at http://localhost:${port}`);
  });
})();
