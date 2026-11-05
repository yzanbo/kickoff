import { baseName } from "@/lib/format";
import { FileIcon } from "./FileIcon";

/** 右の欄のファイルのタブの名前の前のアイコン（エディタと同じ、ファイルの種類のアイコン） */
export function FileTabLead({ tab }: { tab: { path: string } }) {
  return <FileIcon name={baseName(tab.path)} />;
}
