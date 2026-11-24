// 全ノートの画面の計算（欄の並び・「〜へ移す」の行き先・欄の開閉の覚え方。純粋）
import type { NoteMoveTarget } from "@/features/notes/ui/tree/NoteListMenu";

/** 全ノートの画面の欄の開閉を覚える場所（ノートのタブ・右サイドバーの "notes" とは別に覚える。欄の数も初めの開き方も違うため） */
export const ALL_NOTES_FOLD_PLACE = "allNotes";

/** 全ノートの画面の欄 1 つ */
export interface AllNotesSection {
  projectId: number;
  /** 見出しの名前（共通のノートは「共通のノート」、プロジェクトはその名前） */
  title: string;
  common: boolean;
  /** 開閉の覚えのキー */
  foldKey: string;
  /** 覚えていないときに開いているか（共通のノートは開き、プロジェクトは閉じる = 開くまで一覧を読みに行かない） */
  defaultOpen: boolean;
}

/** 欄の開閉の覚えのキー（共通のノートは 1 つ、プロジェクトはその id ごと） */
export const allNotesFoldKey = (projectId: number, common: boolean) => (common ? "common" : `p${projectId}`);

/**
 * 欄の並び: いちばん上に共通のノート（使えないとき・まだ分からないときは null で入れない）、その下にプロジェクトを渡した順で
 * （サイドバーと同じ並び。見えない・アーカイブしたプロジェクトは置く側が外して渡す）
 */
export function allNotesSections(common: { projectId: number; title: string } | null, projects: readonly { id: number; name: string }[]): AllNotesSection[] {
  const sections: AllNotesSection[] = projects.map((p) => ({ projectId: p.id, title: p.name, common: false, foldKey: allNotesFoldKey(p.id, false), defaultOpen: false }));
  return common ? [{ ...common, common: true, foldKey: allNotesFoldKey(common.projectId, true), defaultOpen: true }, ...sections] : sections;
}

/** その欄の右クリックの「〜へ移す」の行き先（ほかのすべての欄の根。多ければメニューが「ほかの欄へ移す」の横にまとめる） */
export function allNotesMoveTargets(sections: readonly AllNotesSection[], projectId: number): NoteMoveTarget[] {
  return sections
    .filter((s) => s.projectId !== projectId)
    .map((s) => ({ projectId: s.projectId, name: s.title, label: s.common ? "共通のノートへ移す" : `「${s.title}」のノートへ移す` }));
}
