import { FileCode2, StickyNote } from "lucide-react";
import { noteExtensionOf, noteKindOf } from "@shared/notes/kinds";
import type { NoteSearchHit } from "@shared/notes/types";
import { Highlight } from "@/foundation/ui/kit/Highlight";
import { notesStore } from "./store";
import { useKeyedStores } from "@/foundation/ui/store/useStore";
import { useProjects } from "@/features/projects/ui";
import type { PaletteItem } from "@/features/palette/ui";
import { baseName, parentOf } from "./notePaths";

/** ノートの印（HTML のノートは別の印） */
const noteIcon = (path: string) => (noteKindOf(path) === "html" ? <FileCode2 size={15} aria-label="HTML のノート" /> : <StickyNote size={15} aria-label="ノート" />);


export function usePaletteNotes(enabled: boolean): readonly PaletteItem[] {
  const { projects, projectName } = useProjects();
  const ids = projects.map((p) => p.id);
  const lists = useKeyedStores(notesStore, enabled ? ids : [], { active: enabled });
  if (!enabled) return NONE;
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
        icon: noteIcon(e.path),
        route: { name: "project", id, tab: "notes", note: e.path },
      });
    }
  }
  return items;
}

const NONE: readonly PaletteItem[] = [];

/** ノートの中の文で見つかった 1 行を、⌘K の行にする（押すとそのプロジェクトのノートのタブでノートを開き、その行へ移る） */
export function noteTextItem(hit: NoteSearchHit, projectName: (id: number) => string): PaletteItem {
  return {
    key: `mt-${hit.project_id}-${hit.path}-${hit.line}`,
    label: <Highlight text={hit.text} marks={[[hit.match_start, hit.match_end]]} />,
    text: hit.text,
    hint: `${baseName(hit.path)}:${hit.line} · ${projectName(hit.project_id)}`,
    icon: noteIcon(hit.path),
    route: { name: "project", id: hit.project_id, tab: "notes", note: hit.path, noteLine: hit.line },
  };
}
