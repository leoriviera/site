import { readFileSync } from "fs";
import { compile } from "handlebars";
import { marked } from "marked";

import {
  OutlineDocumentContent,
  OutlineDocumentsByPath,
  Response,
  TemplateContext,
} from "./types";
import { generateIcons, replaceWikiLinks } from "./utils";

export const loadTemplate = (templatePath: string) =>
  compile<TemplateContext>(readFileSync(templatePath, "utf-8").toString());

export const generateResponse = async (
  url: string,
  pageContent: OutlineDocumentContent | undefined,
  documents: OutlineDocumentsByPath,
  startTime: number,
  contextOverride: Pick<
    TemplateContext,
    "commit" | "failover" | "useSampleData" | "siteName"
  >,
): Promise<Response> => {
  const { commit, failover, useSampleData, siteName } = contextOverride;

  if (pageContent === undefined) {
    const { emoji, favicon } = generateIcons("🥸");
    return {
      status: 404,
      context: {
        siteName,
        title: "leo/404",
        description: "Page not found.",
        emoji,
        favicon,
        html: "<p>Page not found.</p>",
        renderTime: new Date().getTime() - startTime,
        commit,
        failover,
        useSampleData,
      },
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
      options: {
        useTemplate: true,
      },
    };
  }

  const { text, icon, updatedAt } = pageContent;
  const html = await marked.parse(text);
  const { emoji, favicon } = generateIcons(icon);

  // We extract the first <p> tag from the HTML to use as the description for
  // the page. We really shouldn't add links to the first <p> in pages, because
  // they'll show up here. I've gone against using a parser mostly for speed,
  // but I probably need to run some benchmarks (hah! as if.)
  const description = /<p>(.*?)<\/p>/.exec(html)?.[1] ?? "";

  return {
    status: 200,
    context: {
      siteName,
      title: `leo${url}`,
      description,
      favicon,
      emoji,
      html: replaceWikiLinks(documents, html),
      updatedAt,
      renderTime: new Date().getTime() - startTime,
      commit,
      failover,
      useSampleData,
    },
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
    options: {
      useTemplate: true,
    },
  };
};
