import { readFile } from "fs/promises";

type OutlineDocument = {
  id: string;
  url: string;
  title: string;
  children: OutlineDocument[];
};

type OutlineDocumentsByPath = Record<string, Omit<OutlineDocument, "children">>;

type OutlineDocumentContent = {
  title: string;
  text: string;
  updatedAt: string;
};

export const setEnv = async () => {
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
  } catch (err) {
    if (err.code !== "ENOENT") {
      throw err;
    }
  }
};

export const getCollectionDocumentTree = async () => {
  const url = new URL(
    "/api/collections.documents",
    process.env.OUTLINE_API_HOST
  );

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
      `HTTP error when fetching collection documents! status: ${response.status}`
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
    documents: OutlineDocumentsByPath = {}
  ): OutlineDocumentsByPath => {
    for (const document of tree) {
      documents[`${prefix}${document.title}`] = {
        id: document.id,
        title: document.title,
        url: document.url,
      };

      if (document.children.length > 0) {
        return traverseDocumentTree(
          document.children,
          `${prefix}${document.title}/`,
          documents
        );
      }
    }

    return documents;
  };

  const data = traverseDocumentTree(documentTree);

  return { data, lastFetched: new Date() };
};

export const fetchPageContent = async (
  document: OutlineDocumentsByPath[string]
): Promise<OutlineDocumentContent> => {
  const url = new URL("/api/documents.info", process.env.OUTLINE_API_HOST);

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
      `HTTP error when fetching document content! status: ${response.status}`
    );
  }

  const json = await response.json();

  const { data } = json as { data: OutlineDocumentContent };

  return data;
};

export const replaceWikiLinks = async (
  documents: OutlineDocumentsByPath,
  content: string
): Promise<string> => {
  let newContent = content;

  for (const document in documents) {
    const oldUrl = new URL(
      documents[document].url,
      process.env.OUTLINE_API_HOST
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
