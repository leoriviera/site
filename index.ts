import { readFile } from "fs/promises";
import { compile } from "handlebars";
import { createServer } from "http";
import { exec } from "child_process";

import {
  fetchPageContent,
  generateIcons,
  getDocuments,
  replaceWikiLinks,
  setEnv,
} from "./utils";
import { marked } from "marked";
import { OutlineDocumentsByPath } from "./types";

(async () => {
  // Parse env file into process.env, while also defining default environment
  // variables. I've done it like this so I can definitely document what variables
  // I expect, and ensure they have *some* value at runtime.
  await setEnv({
    USE_SAMPLE_DATA: "false",
  });

  const port = process.env.PORT || 3000;
  const requiredEnv = [
    "OUTLINE_API_KEY",
    "OUTLINE_COLLECTION_ID",
    "OUTLINE_API_HOST",
    "WEBSITE_URL",
    "TEMPLATE_PATH",
  ];

  const missingEnv = requiredEnv.filter((key) => !process.env[key]);
  if (missingEnv.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missingEnv.join(", ")}`,
    );
  }

  const template = compile(
    (await readFile(process.env.TEMPLATE_PATH!, "utf-8")).toString(),
  );

  // TODO - check whether I'm using USE_SAMPLE_DATA here

  // Get current hash
  const shortHash: string = await new Promise((res, rej) => {
    exec("git rev-parse --short HEAD", (err, out) => {
      if (err) {
        rej(err);
      }
      res(out.trim());
    });
  });

  // TODO - figure out why diff-index HEAD returns dirty in container, but not
  // locally or in shell
  // const changesExist: boolean = await new Promise((res, rej) => {
  //   exec("git diff-index HEAD", (err, out) => {
  //     console.log(err, out);

  //     if (err == null) {
  //       res(false);
  //       return;
  //     }

  //     if (err?.code == 1) {
  //       res(true);
  //       return;
  //     }

  //     rej(err);
  //   });
  // });

  type Response = {
    status: number;
    context: string | Record<string, unknown>;
    headers: Record<string, string>;
    options: {
      useTemplate: boolean;
    };
  };

  const commit = `${shortHash}`;

  const generateResponse = async (
    url: string,
    documents: OutlineDocumentsByPath,
    startTime: number,
  ): Promise<Response> => {
    if (!documents) {
      throw new Error("No documents fetched from Outline. Throwing error.");
    }

    // Return content.json to allow for external failover
    // TODO - move this to a worker on a timer (every 30s?)
    if (url == "/content.json") {
      const results = await Promise.all(
        Object.entries(documents).map(async ([path, document]) => {
          const { text, updatedAt, icon } = await fetchPageContent(document);

          return {
            path,
            title: `leo${path}`,
            icon,
            html: template(replaceWikiLinks(documents, text)),
            updatedAt,
          };

          // Handlebars.json uses eval, which means Cloudflare Workers doesn't
          // rendering the template.
          // https://community.cloudflare.com/t/code-generation-from-strings-disallowed-for-this-context/15215
          // We render here, and send the HTML over the wire.
        }),
      );

      return {
        status: 200,
        context: JSON.stringify({
          results,
          commit,
          renderTime: new Date().getTime() - startTime,
        }),
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
        options: {
          useTemplate: false,
        },
      };
    }

    const document = documents[url];

    // If we can't find the document OR the 404 document, use a hard-coded 404
    if (document === undefined && !documents["/404"]) {
      const { emoji, favicon } = generateIcons("🥸");
      return {
        status: 404,
        context: {
          title: "leo/404",
          emoji,
          favicon,
          html: "<p>Page not found.</p>",
          renderTime: new Date().getTime() - startTime,
          commit,
        },
        headers: {
          "Content-Type": "text/html; charset=utf-8",
        },
        options: {
          useTemplate: true,
        },
      };
    }

    const { text, updatedAt, icon } = await fetchPageContent(
      document ?? documents["/404"],
    );
    const html = await marked.parse(text);
    const { emoji, favicon } = generateIcons(icon);

    return {
      status: document ? 200 : 404,
      context: {
        title: `leo${url}`,
        favicon,
        emoji,
        html: replaceWikiLinks(documents, html),
        updatedAt,
        renderTime: new Date().getTime() - startTime,
        commit,
      },
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
      options: {
        useTemplate: true,
      },
    };
  };

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

      const { data: documents } = await getDocuments();

      response = await generateResponse(url, documents, startTime);
    } catch (error) {
      console.log(error);
    } finally {
      return res.writeHead(response.status, response.headers).end(
        response.options.useTemplate
          ? // TODO - template render time is, unironically, not included in renderTime. fix this, idiot.
            template(response.context)
          : response.context,
      );
    }
  }).listen(port, () => {
    console.log(`Listening on port ${port}`);
  });
})();
