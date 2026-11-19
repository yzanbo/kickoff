import { FileCode2, StickyNote } from "lucide-react";
import { noteExtensionOf, noteKindOf } from "@shared/notes/kinds";
import type { Project } from "@shared/types";
import { useMemo } from "react";
import { notesStore } from "@/features/notes/ui/stores/notes";
import { useKeyedStores } from "@/foundation/ui/store/useStore";
import { baseName, parentOf } from "./notePaths";
import type { PaletteItem } from "@/features/palette/ui/paletteItem";

/**
 * ⌘K で探すノート（すべてのプロジェクトのノート。フォルダ・画像などノートでないファイルは除く）。押すとそのプロジェクトのノートのタブで開く。
 * 名前はファイル名（拡張子まで）、横にフォルダとプロジェクト名。フォルダの名前でも絞り込めるよう、絞り込みの文はノートのフォルダからのパス。
 * enabled（探す対象にノートを入れている）ときだけ、プロジェクトごとのノートの一覧を読む
 */
export function usePaletteNotes(projects: readonly Project[], enabled: boolean, projectName: (id: number) => string): PaletteItem[] {
  const ids = useMemo(() => projects.map((p) => p.id), [projects]);
  const lists = useKeyedStores(notesStore, enabled ? ids : [], { active: enabled });
  return useMemo(() => {
    if (!enabled) return [];
    const items: PaletteItem[] = [];
    for (const id of ids) {
      for (const e of lists(id).data?.entries ?? []) {
        if (e.dir || !noteExtensionOf(e.path)) continue;
        const folder = parentOf(e.path);
        items.push({
          key: `note-${id}-${e.path}`,
          label: baseName(e.path),
          text: e.path,
          hint: folder ? `${folder} · ${projectName(id)}` : projectName(id),
          icon: noteKindOf(e.path) === "html" ? <FileCode2 size={15} aria-label="HTML のノート" /> : <StickyNote size={15} aria-label="ノート" />,
          route: { name: "project", id, tab: "notes", note: e.path },
        });
      }
    }
    return items;
  }, [enabled, ids, lists, projectName]);
}
