export type OutlineDocument = {
  id: string;
  url: string;
  title: string;
  icon?: string;
  children: OutlineDocument[];
};

export type OutlineDocumentContent = {
  title: string;
  text: string;
  icon?: string;
  updatedAt: string;
};

export type OutlineDocumentsByPath = Record<
  string,
  Omit<OutlineDocument, "children">
>;

export type Icon = {
  emoji?: string;
  favicon: string;
};
