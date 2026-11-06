import { FileCode2, StickyNote } from "lucide-react";
import { memoExtensionOf, memoKindOf } from "@shared/memo/kinds";
import type { Project } from "@shared/types";
import { useMemo } from "react";
import { memosStore } from "@/stores/memos";
import { useKeyedStores } from "@/stores/useStore";
import { baseName, parentOf } from "@/features/memo/memoPaths";
import type { PaletteItem } from "./paletteItem";

/**
 * ⌘K で探すメモ（すべてのプロジェクトのメモ。フォルダ・画像などメモでないファイルは除く）。押すとそのプロジェクトのメモのタブで開く。
 * 名前はファイル名（拡張子まで）、横にフォルダとプロジェクト名。フォルダの名前でも絞り込めるよう、絞り込みの文はメモのフォルダからのパス。
 * enabled（探す対象にメモを入れている）ときだけ、プロジェクトごとのメモの一覧を読む
 */
export function usePaletteMemos(projects: readonly Project[], enabled: boolean, projectName: (id: number) => string): PaletteItem[] {
  const ids = useMemo(() => projects.map((p) => p.id), [projects]);
  const lists = useKeyedStores(memosStore, enabled ? ids : [], { active: enabled });
  return useMemo(() => {
    if (!enabled) return [];
    const items: PaletteItem[] = [];
    for (const id of ids) {
      for (const e of lists(id).data?.entries ?? []) {
        if (e.dir || !memoExtensionOf(e.path)) continue;
        const folder = parentOf(e.path);
        items.push({
          key: `memo-${id}-${e.path}`,
          label: baseName(e.path),
          text: e.path,
          hint: folder ? `${folder} · ${projectName(id)}` : projectName(id),
          icon: memoKindOf(e.path) === "html" ? <FileCode2 size={15} aria-label="HTML のメモ" /> : <StickyNote size={15} aria-label="メモ" />,
          route: { name: "project", id, tab: "memos", memo: e.path },
        });
      }
    }
    return items;
  }, [enabled, ids, lists, projectName]);
}
