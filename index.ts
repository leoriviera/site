import { readFile } from "fs/promises";
import { compile } from "handlebars";
import { createServer } from "http";

import {
  fetchPageContent,
  getDocuments,
  replaceWikiLinks,
  setEnv,
} from "./utils";
import { marked } from "marked";

(async () => {
  // Parse env file into process.env
  await setEnv();

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
      `Missing required environment variable(s): ${missingEnv.join(", ")}`
    );
  }

  const template = compile(
    (await readFile(process.env.TEMPLATE_PATH!, "utf-8")).toString()
  );

  createServer(async (req, res) => {
    const start = new Date().getTime();

    let response = {
      status: 200,
      context: {},
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    };

    try {
      const url =
        req.url === undefined || req.url === "/"
          ? "/index"
          : decodeURI(new URL(req.url, process.env.WEBSITE_URL).pathname);

      const { data: documents } = await getDocuments();

      if (!documents) {
        response = {
          status: 500,
          context: {
            title: "leo/error",
            html: `<p>Something went wrong, and this blog failed to fetch documents from Outline.</p>
            <p>I'm probably aware of the issue, and looking into it!</p>`,
            renderTime: new Date().getTime() - start,
          },
          headers: {
            "Content-Type": "text/html; charset=utf-8",
          },
        };
      } else {
        const document = documents[url];

        if (document !== undefined) {
          const { text, updatedAt } = await fetchPageContent(document);

          const html = await marked.parse(text);

          response = {
            status: 200,
            context: {
              title: `leo${url}`,
              html: await replaceWikiLinks(documents, html),
              updatedAt,
              renderTime: new Date().getTime() - start,
            },
            headers: {
              "Content-Type": "text/html; charset=utf-8",
            },
          };
        } else {
          const notFoundDocument = documents["/404"];

          if (!notFoundDocument) {
            response = {
              status: 404,
              context: {
                title: "leo/404",
                html: "<p>Page not found.</p>",
                renderTime: new Date().getTime() - start,
              },
              headers: {
                "Content-Type": "text/html; charset=utf-8",
              },
            };
          } else {
            const { text, updatedAt } = await fetchPageContent(
              notFoundDocument
            );

            const html = await marked.parse(text);

            response = {
              status: 404,
              context: {
                title: `leo${url}`,
                html: await replaceWikiLinks(documents, html),
                updatedAt,
                renderTime: new Date().getTime() - start,
              },
              headers: {
                "Content-Type": "text/html; charset=utf-8",
              },
            };
          }
        }
      }
    } catch (error) {
      console.log(error);

      response = {
        status: 500,
        context: {
          title: "leo/500",
          html: "<p>Something went wrong, and the server failed to render the page.</p><p>Womp womp.</p>",
          renderTime: new Date().getTime() - start,
        },
        headers: {
          "Content-Type": "text/html; charset=utf-8",
        },
      };
    } finally {
      return res
        .writeHead(response.status, response.headers)
        .end(template(response.context));
    }
  }).listen(port, () => {
    console.log(`Listening on port ${port}`);
  });
})();
