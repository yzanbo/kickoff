import type { PaletteNamedSource, PaletteTextSource } from "@/features/palette/ui";
import { notesApi } from "@/features/notes/ui/api";
import { currentProjectsIndex } from "@/features/projects/ui";
import { noteTextItem, usePaletteNotes } from "./paletteSource";

/**
 * ⌘K で探すノート（すべてのプロジェクトのノート。フォルダ・画像などノートでないファイルは除く）。押すとそのプロジェクトのノートのタブで開く。
 * 名前はファイル名（拡張子まで）、横にフォルダとプロジェクト名（共通のノートは「共通のノート」）。フォルダの名前でも絞り込めるよう、絞り込みの文はノートのフォルダからのパス。
 * 探す対象にノートを入れているときだけ、プロジェクトごとのノートの一覧を読む
 */
export const notePaletteSource: PaletteNamedSource = { id: "note", label: "ノート", order: 30, byDefault: true, useItems: usePaletteNotes };

/** ⌘K のノート内の文言（すべてのプロジェクトのノートの中の行を、入力したときだけ探す） */
export const noteTextPaletteSource: PaletteTextSource = {
  id: "noteText",
  label: "ノート内の文言",
  order: 50,
  search: (q) => notesApi("GET /api/notes/search", { query: { q } }).then((r) => r.hits.map((h) => noteTextItem(h, currentProjectsIndex().projectsById))),
};
