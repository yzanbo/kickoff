import { useMemo, type ReactNode } from "react";
import { MarkdownFileLinksContext, type MarkdownFileLinks } from "@/ui/markdown/markdownFileLinks";
import { FileLinkContext, type FileLinks } from "./fileLinkContext";
import { remarkFileLinks } from "./fileRefs";

/** チャットのパネルの中で、返答のファイルのパス（Markdown）とターンの変更カードを、押して開けるようにする */
export function FileLinksProvider({ value, children }: { value: FileLinks | undefined; children: ReactNode }) {
  const markdown = useMemo<MarkdownFileLinks | undefined>(
    () => (value ? { remarkPlugin: [remarkFileLinks, value.index], open: (path, line) => value.open({ path, ...(line ? { line } : {}) }) } : undefined),
    [value],
  );
  return (
    <FileLinkContext.Provider value={value}>
      <MarkdownFileLinksContext.Provider value={markdown}>{children}</MarkdownFileLinksContext.Provider>
    </FileLinkContext.Provider>
  );
}
