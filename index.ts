import { readFile } from "fs/promises";
import { compile } from "handlebars";
import { createServer } from "http";

import { fetchPageContent, getDocuments, setEnv } from "./utils";
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
    try {
      const url =
        req.url === undefined || req.url === "/"
          ? "/index"
          : new URL(decodeURI(req.url)).href;

      const documents = await getDocuments();
      if (!documents) {
        return res
          .writeHead(500, { "Content-Type": "text/html; charset=utf-8" })
          .end(
            template({
              title: "leo/error",
              html: `<p>Something went wrong, and this blog failed to fetch documents from Outline.</p>
            <p>I'm probably aware of the issue, and looking into it!</p>`,
              now: new Date().toISOString(),
            })
          );
      }

      const { data } = documents;

      const document = data[url];

      if (document !== undefined) {
        const { text, updatedAt } = await fetchPageContent(document);

        const html = await marked.parse(text);

        return res
          .writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
          .end(
            template({
              title: `leo${url}`,
              html,
              updatedAt,
              now: new Date().toISOString(),
            })
          );
      } else {
        const notFoundDocument = documents["/404"];

        if (!notFoundDocument) {
          return res
            .writeHead(404, { "Content-Type": "text/plain" })
            .end("Page not found.");
        }

        const { text, updatedAt } = await fetchPageContent(notFoundDocument);

        const html = await marked.parse(text);

        return res
          .writeHead(404, { "Content-Type": "text/html; charset=utf-8" })
          .end(
            template({
              title: `leo${url}`,
              html,
              updatedAt,
              now: new Date().toISOString(),
            })
          );
      }
    } catch (error) {
      console.log(error);

      return res
        .writeHead(500, { "Content-Type": "text/plain" })
        .end("An error occurred.");
    }
  }).listen(port, () => {
    console.log(`Listening on port ${port}`);
  });
})();
