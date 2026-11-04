import manifest from "material-icon-theme/dist/material-icons.json";
import { languageOf } from "@/lib/highlight";
import type { AppliedTheme } from "@/app/theme";

/**
 * フォルダ・ファイルのアイコン（VS Code の Material Icon Theme と同じ）。
 * SVG は埋め込まずにファイルとして出し、使うものだけ読み込む。このモジュールは FileIcon から、使うときに読み込む
 */
const ICON_DIR = "../../../../../node_modules/material-icon-theme/icons/";
const ICON_URLS = import.meta.glob<string>("../../../../../node_modules/material-icon-theme/icons/*.svg", {
  query: "?url&no-inline",
  import: "default",
  eager: true,
});

type Mapping = Record<string, string>;
type MappingKey = "fileExtensions" | "fileNames" | "languageIds" | "folderNames" | "folderNamesExpanded";
const definitions = manifest.iconDefinitions as Record<string, { iconPath: string }>;
const lightMappings = manifest.light as Partial<Record<MappingKey, Mapping>>;

/** 名前からアイコンの名前を引く（ライトの配色に専用のアイコンがあれば、そちらを使う） */
function lookup(key: MappingKey, name: string, theme: AppliedTheme): string | undefined {
  return (theme === "light" ? lightMappings[key]?.[name] : undefined) ?? (manifest[key] as Mapping)[name];
}

/** VS Code と同じ順で決める: フォルダは名前、ファイルは名前 → 拡張子（長いものから。"test.ts" → "ts"）→ 言語 */
function iconId(name: string, dir: boolean, open: boolean, theme: AppliedTheme): string {
  const lower = name.toLowerCase();
  if (dir) return lookup(open ? "folderNamesExpanded" : "folderNames", lower, theme) ?? (open ? manifest.folderExpanded : manifest.folder);
  let id = lookup("fileNames", lower, theme);
  for (let dot = lower.indexOf("."); !id && dot >= 0; dot = lower.indexOf(".", dot + 1)) id = lookup("fileExtensions", lower.slice(dot + 1), theme);
  const lang = id ? undefined : languageOf(name);
  if (lang) id = lookup("languageIds", lang, theme);
  return id ?? manifest.file;
}

/** フォルダ・ファイルのアイコンの URL（見つからなければ undefined） */
export function iconUrl(name: string, dir: boolean, open: boolean, theme: AppliedTheme): string | undefined {
  const path = definitions[iconId(name, dir, open, theme)]?.iconPath;
  return path ? ICON_URLS[ICON_DIR + path.slice(path.lastIndexOf("/") + 1)] : undefined;
}
