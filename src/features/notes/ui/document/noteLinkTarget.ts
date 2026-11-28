// ノートのリンクの行き先を決める純粋な関数: 外のページ・このノートの見出し・ノートのフォルダの中のノート / ファイル / フォルダ・開けないもの。
// 相対のパスは、このノートの入ったフォルダから読む（HTML のノートのページのリンクと同じく、ノートのフォルダの外は開かない）
import type { Tree } from "@lezer/common";
import { noteExtensionOf } from "@shared/notes/kinds";
import { linkTargetOf } from "@shared/foundation/linkTarget";
import { lineEndOf, walkBlocks } from "./blockWalk";

export type NoteLinkTarget =
  /** 外のページ（http・https。読み直した URL） */
  | { kind: "web"; url: string }
  /** このノートの見出し（# の後ろ） */
  | { kind: "heading"; id: string }
  /** ノートのフォルダの中のノート（.md・.html。ノートのフォルダからの相対のパス） */
  | { kind: "note"; path: string }
  /** ノートのフォルダの中の、ノートでないファイルかフォルダ（空のパスはノートのフォルダそのもの） */
  | { kind: "file"; path: string }
  /** 開けない（理由の文） */
  | { kind: "none"; reason: string };

const OTHER_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** リンクの行き先（notePath は開いているノートの、ノートのフォルダからの相対のパス） */
export function noteLinkTarget(href: string, notePath: string): NoteLinkTarget {
  const raw = href.trim();
  if (!raw) return { kind: "none", reason: "行き先が書かれていません" };
  if (raw.startsWith("#")) {
    const id = raw.slice(1);
    try {
      return { kind: "heading", id: decodeURIComponent(id) };
    } catch {
      return { kind: "heading", id };
    }
  }
  // www. で始まる URL のそのまま書きは http で読む（返答の表示と同じ）
  const web = linkTargetOf(/^www\./i.test(raw) ? `http://${raw}` : raw);
  if (web?.kind === "web") return { kind: "web", url: web.url };
  if (OTHER_SCHEME.test(raw) || raw.startsWith("//")) return { kind: "none", reason: "このリンクは開けません（開けるのは http・https のページと、ノートのフォルダの中だけ）" };
  if (raw.startsWith("/")) return { kind: "none", reason: "ノートのフォルダの外を指しています" };
  const path = raw.replace(/[?#].*$/, "");
  const folder = notePath.includes("/") ? notePath.slice(0, notePath.lastIndexOf("/")).split("/") : [];
  const segments = [...folder];
  for (const part of path.split("/")) {
    let name: string;
    try {
      name = decodeURIComponent(part);
    } catch {
      return { kind: "none", reason: "行き先のパスが読めません" };
    }
    if (name === "" || name === ".") continue;
    if (name === "..") {
      if (!segments.length) return { kind: "none", reason: "ノートのフォルダの外を指しています" };
      segments.pop();
    } else segments.push(name);
  }
  const resolved = segments.join("/");
  return noteExtensionOf(resolved) && !path.endsWith("/") ? { kind: "note", path: resolved } : { kind: "file", path: resolved };
}

/** 見出しの文から、# の行き先の名前（返答の表示と同じ形: 小文字・空白は -・記号を除く） */
export function headingSlug(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

/** このノートの見出しのうち、# の後ろの id が指すものの頭（見出しの文の行き先の名前か、文そのものが同じ最初のもの。なければ null） */
export function headingPosition(tree: Tree, text: string, id: string): number | null {
  const want = headingSlug(id);
  let found: number | null = null;
  walkBlocks(
    tree,
    (node) => {
      if (!/^(ATX|Setext)Heading\d$/.test(node.name)) return false;
      // 見出しの頭から読む（引用の > ・リストの印は見出しの文でない）
      const line = text.slice(node.from, lineEndOf(text, node.from)).replace(/^\s*#+\s*/, "").replace(/\s*#*\s*$/, "");
      if (headingSlug(line) !== want && line !== id) return false;
      found = node.from;
      return true;
    },
    { quotes: true },
  );
  return found;
}
