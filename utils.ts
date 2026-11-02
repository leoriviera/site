import { readFile } from "fs/promises";
import { sampleDocumentContent, sampleDocumentTree } from "./sampleData";
import {
  Icon,
  OutlineDocument,
  OutlineDocumentContent,
  OutlineDocumentsByPath,
} from "./types";

const USE_SAMPLE_DATA = process.env.USE_SAMPLE_DATA === "true";

export const setEnv = async (
  defaultEnv: Record<string, string> = {},
): Promise<void> => {
  try {
    const file = await readFile(".env", "utf-8");

    for (const line of file.split("\n")) {
      const [key, value] = line.split("=");

      // We don't want to override any already set environment variables,
      // such as from the command line or the system environment.
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch (err: any) {
    if (err.code !== "ENOENT") {
      throw err;
    }
  }

  // Set default values of environment variables
  for (const [key, defaultValue] of Object.entries(defaultEnv)) {
    if (process.env[key] === undefined) {
      process.env[key] = defaultValue;
    }
  }
};

export const getCollectionDocumentTree = async (): Promise<
  OutlineDocument[]
> => {
  const url = new URL(
    "/api/collections.documents",
    process.env.OUTLINE_API_HOST,
  );

  if (USE_SAMPLE_DATA) {
    return sampleDocumentTree;
  }

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OUTLINE_API_KEY}`,
    },
    body: JSON.stringify({
      id: process.env.OUTLINE_COLLECTION_ID,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `HTTP error when fetching collection documents! status: ${response.status}`,
    );
  }

  const json = await response.json();

  const { data } = json as { data: OutlineDocument[] };

  return data;
};

export const getDocuments = async () => {
  const documentTree = await getCollectionDocumentTree();

  const traverseDocumentTree = (
    tree: OutlineDocument[],
    prefix: string = "/",
    documents: OutlineDocumentsByPath = {},
  ): OutlineDocumentsByPath => {
    for (const document of tree) {
      documents[`${prefix}${document.title}`] = {
        id: document.id,
        title: document.title,
        icon: document.icon,
        url: document.url,
      };

      if (document.children.length > 0) {
        return traverseDocumentTree(
          document.children,
          `${prefix}${document.title}/`,
          documents,
        );
      }
    }

    return documents;
  };

  const data = traverseDocumentTree(documentTree);

  return { data, lastFetched: new Date() };
};

export const fetchPageContent = async (
  document: OutlineDocumentsByPath[string],
): Promise<OutlineDocumentContent> => {
  const url = new URL("/api/documents.info", process.env.OUTLINE_API_HOST);

  if (USE_SAMPLE_DATA) {
    return sampleDocumentContent[document.id];
  }

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OUTLINE_API_KEY}`,
    },
    body: JSON.stringify({
      id: document.id,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `HTTP error when fetching document content! status: ${response.status}`,
    );
  }

  const json = await response.json();

  const { data } = json as { data: OutlineDocumentContent };

  return data;
};

export const replaceWikiLinks = (
  documents: OutlineDocumentsByPath,
  content: string,
): string => {
  let newContent = content;

  for (const document in documents) {
    const oldUrl = new URL(
      documents[document].url,
      process.env.OUTLINE_API_HOST,
    );
    const newUrl = new URL(document, process.env.WEBSITE_URL);

    newContent = newContent
      // Replace absolute Outline URLs
      .replaceAll(oldUrl.toString(), newUrl.toString())
      // Replace relative Outline URLs
      .replaceAll(documents[document].url, document);
  }

  return newContent;
};

export const generateIcons = (icon?: string): Icon => {
  // Outline uses icons, which come from the outline-icons package.
  // (https://github.com/outline/outline-icons)
  // These are represented by text strings.
  // If it's not an emoji, we want to ignore it for now.
  const isIconEmoji = /\p{Regional_Indicator}|\p{Extended_Pictographic}/u.test(
    icon ?? "",
  );

  // If no icon emoji, fall back to no page emoji and orange favicon
  return {
    emoji: isIconEmoji ? icon : undefined,
    favicon: `<link
      rel='icon'
      href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>${isIconEmoji ? icon : "🧡"}</text></svg>"
    />`,
  };
};
