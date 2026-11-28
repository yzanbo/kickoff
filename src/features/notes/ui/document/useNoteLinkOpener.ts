// 開いたノートのリンクの行き先の説明と開き方（Markdown のノートのリンクの小窓・⌘ ＋クリックと、HTML のノートのページのリンク）と、画像の読み先
import { useCallback } from "react";
import { noteExtensionOf } from "@shared/notes/kinds";
import { alert } from "@/foundation/ui/kit/ask";
import { openWebLink } from "@/foundation/ui/external/linkOpen";
import { openExternal } from "@/foundation/ui/external/native";
import { useNoteList } from "@/features/notes/ui/store";
import type { NoteLinkOpener } from "./linkTooltip";
import { noteLinkTarget } from "./noteLinkTarget";
import { noteAssetBase } from "./htmlPage";

const MISSING = "リンク先が見つかりません";

export function useNoteLinkOpener({ projectId, path, dir, onOpenNote }: { projectId: number; path: string; dir: string; onOpenNote: (path: string) => void }) {
  const list = useNoteList(projectId);
  const entryOf = (to: string) => list.data?.entries.find((e) => e.path === to);
  /** ノートのフォルダの中を開く（ノートはそのノート・フォルダとノートでないファイルは Finder で表示） */
  const openInNotes = (to: string) => {
    const entry = entryOf(to);
    if (!entry && to !== "") void alert(MISSING, `ノートのフォルダに「${to}」がありません。`);
    else if (entry && !entry.dir && noteExtensionOf(to)) {
      if (to !== path) onOpenNote(to);
    } else void openExternal({ kind: "reveal", path: to ? `${dir}/${to}` : dir });
  };
  const opener: NoteLinkOpener = {
    describe(href) {
      const target = noteLinkTarget(href, path);
      if (target.kind === "web") return { label: target.url, problem: null };
      if (target.kind === "heading") return { label: `見出し「${target.id}」へ`, problem: null };
      if (target.kind === "none") return { label: href, problem: target.reason };
      const entry = target.path === "" ? { dir: true } : entryOf(target.path);
      if (!entry) return { label: target.path, problem: `${MISSING}（${target.path}）` };
      return { label: entry.dir || target.kind === "file" ? `${target.path || "ノートのフォルダ"}（Finder で表示）` : target.path, problem: null };
    },
    open(href, text, invert) {
      const target = noteLinkTarget(href, path);
      if (target.kind === "web") void openWebLink(target.url, text, { invert, projectId });
      else if (target.kind === "note" || target.kind === "file") openInNotes(target.path);
      else if (target.kind === "none") void alert("このリンクは開けません", target.reason);
    },
  };
  /**
   * 画像の src を画面で読める URL に（ノートのフォルダの中だけ。コアのファイルの口。HTML のノートのページと同じ）。
   * ノートが替わったときだけ作り直す（画像の描き方の値がこれに頼るので、毎回替わると中の画像の部品がすべて描き直る）
   */
  const imageUrl = useCallback(
    (src: string) => {
      const target = noteLinkTarget(src, path);
      if (target.kind !== "note" && target.kind !== "file") return null;
      return `${noteAssetBase(location.origin, projectId, "")}${target.path.split("/").map(encodeURIComponent).join("/")}`;
    },
    [projectId, path],
  );
  return { opener, openInNotes, imageUrl };
}
