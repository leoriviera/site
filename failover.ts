import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { getDocuments } from "./utils";

let backingUp = false;

const data = {
  commit: "",
};

const tempDirPath = tmpdir();

const createFailoverBackup = async () => {
  try {
    const startTime = new Date().getTime();

    const { data: documents } = await getDocuments();

    const pages: [string, string][] = await Promise.all(
      Object.entries(documents).map(async ([path, document]) => {
        return [path, ""];
      }),
    );

    // const s = Math.round(Math.random() * 100 + 1);
    // console.log(`Waiting for... ${s} ms.`);
    // await new Promise((res) => setTimeout(() => res(undefined), s));
    // console.log("hello! " + new Date().getTime());
    // const results = await Promise.all(
    //   Object.entries(documents).map(async ([path, document]) => {
    //     const { text, updatedAt, icon } = await fetchPageContent(document);
    //     const html = await marked.parse(text);
    //     const { emoji, favicon } = generateIcons(icon);
    //     return {
    //       html: template({
    //         title: `leo${url}`,
    //         favicon,
    //         emoji,
    //         html: replaceWikiLinks(documents, html),
    //         updatedAt,
    //         renderTime: new Date().getTime() - startTime,
    //         commit,
    //       }),
    //     };
    //     // Handlebars.json uses eval, which means Cloudflare Workers doesn't
    //     // rendering the template.
    //     // https://community.cloudflare.com/t/code-generation-from-strings-disallowed-for-this-context/15215
    //     // We render here, and send the HTML over the wire.
    //   }),
    // );
  } catch (error) {
    console.error("error encountered while creating failover backup", {
      error,
    });
  }
};

setInterval(async () => {
  if (data.commit === "") {
    console.log("No commit set.");
  }

  if (backingUp === true) {
    console.log("Currently already backing up!");
    return;
  }

  backingUp = true;
  await createFailoverBackup();
  backingUp = false;

  console.log("Backup complete!");
}, 60_000 * 10);

createFailoverBackup();
