import { FileCode2, StickyNote } from "lucide-react";
import { baseName } from "@shared/foundation/path";
import { noteExtensionOf, noteKindOf } from "@shared/notes/kinds";
import type { NoteSearchHit } from "@shared/notes/types";
import { Highlight } from "@/foundation/ui/kit/Highlight";
import { notesStore } from "./store";
import { useKeyedStores } from "@/foundation/ui/store/useStore";
import { useProjects } from "@/features/projects/ui";
import type { Project } from "@shared/projects/types";
import { isListedProject } from "@shared/projects/kinds";
import { noteOwnerName } from "./commonNotes";
import { showInNoteTab } from "./openNote";
import type { PaletteItem } from "@/features/palette/ui";
import { parentOf } from "./notePaths";

/** ノートの印（HTML のノートは別の印） */
const noteIcon = (path: string) => (noteKindOf(path) === "html" ? <FileCode2 size={15} aria-label="HTML のノート" /> : <StickyNote size={15} aria-label="ノート" />);


export function usePaletteNotes(enabled: boolean): readonly PaletteItem[] {
  const { projects, projectsById } = useProjects();
  const ids = projects.map((p) => p.id);
  const lists = useKeyedStores(notesStore, enabled ? ids : [], { active: enabled });
  if (!enabled) return NONE;
  const items: PaletteItem[] = [];
  for (const id of ids) {
    for (const e of lists(id).data?.entries ?? []) {
      if (e.dir || !noteExtensionOf(e.path)) continue;
      const folder = parentOf(e.path);
      const project = projectsById.get(id);
      const owner = noteOwnerName(project);
      items.push({
        key: `note-${id}-${e.path}`,
        label: baseName(e.path),
        text: e.path,
        hint: folder ? `${folder} · ${owner}` : owner,
        icon: noteIcon(e.path),
        ...openNoteItem(project, id, e.path),
      });
    }
  }
  return items;
}

const NONE: readonly PaletteItem[] = [];

/**
 * ⌘K の行を押したときの開き方: ふつうはそのプロジェクトのノートのタブへ移る URL。見えないプロジェクト（共通のノート）にはその画面がないので、
 * 移らずにノートを開く口（showInNoteTab。いま見ているプロジェクトのノートのタブに開く）を呼ぶ
 */
function openNoteItem(project: Project | undefined, id: number, path: string, line?: number): Pick<PaletteItem, "route" | "run"> {
  if (project && !isListedProject(project)) return { run: () => showInNoteTab(id, path, { line }) };
  return { route: { name: "project", id, tab: "notes", note: path, ...(line ? { noteLine: line } : {}) } };
}

/** ノートの中の文で見つかった 1 行を、⌘K の行にする（押すとそのプロジェクトのノートのタブでノートを開き、その行へ移る） */
export function noteTextItem(hit: NoteSearchHit, projectsById: ReadonlyMap<number, Project>): PaletteItem {
  const project = projectsById.get(hit.project_id);
  return {
    key: `mt-${hit.project_id}-${hit.path}-${hit.line}`,
    label: <Highlight text={hit.text} marks={[[hit.match_start, hit.match_end]]} />,
    text: hit.text,
    hint: `${baseName(hit.path)}:${hit.line} · ${noteOwnerName(project)}`,
    icon: noteIcon(hit.path),
    ...openNoteItem(project, hit.project_id, hit.path, hit.line),
  };
}
