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
  icon: string | null;
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

export type TemplateContext = {
  title: string;
  favicon: string;
  displayFailoverBanner: boolean;
  emoji?: string;
  html: string;
  renderTime?: number;
  commit?: string;
  updatedAt?: string;
  useSampleData: boolean;
};

export type Response = {
  status: number;
  context: TemplateContext;
  headers: Record<string, string>;
  options: {
    useTemplate: boolean;
  };
};

export type WorkerData = {
  commit: string;
  rootDir: string;
};
