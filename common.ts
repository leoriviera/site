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
  commit: string,
  displayFailoverBanner: boolean,
  useSampleData: boolean,
): Promise<Response> => {
  if (pageContent === undefined) {
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
  }

  const { text, icon, updatedAt } = pageContent;
  const html = await marked.parse(text);
  const { emoji, favicon } = generateIcons(icon);

  return {
    status: 200,
    context: {
      title: `leo${url}`,
      favicon,
      emoji,
      html: replaceWikiLinks(documents, html),
      updatedAt,
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
};
