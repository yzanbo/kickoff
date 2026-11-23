import { api } from "@/foundation/ui/api";
import { useEditedProject } from "@/features/projects/ui";
import { useNoteList } from "@/features/notes/ui/store";
import { NoteFolderField } from "./NoteFolderField";

/**
 * プロジェクトの設定の基本情報の「ノートフォルダ」。プロジェクトのフォルダとは別の場所で、フォルダを変えても変わらない。
 * ふだんは空欄（薄い文字でいまの場所 = アプリの設定の「ノート」の親フォルダの下の、このプロジェクトの名前のフォルダ）で、書く・選ぶとこのプロジェクトだけ別の場所にする。
 * ほかのプロジェクトとノートフォルダが同じなら、いつも知らせる（NoteFolderField）
 */
export function ProjectNoteDirField() {
  const project = useEditedProject();
  const dir = useNoteList(project.id).data?.dir;
  return (
    <NoteFolderField
      label="ノートフォルダ"
      help="「ノート」タブのノートを置くフォルダです。ふだんはアプリの設定の「ノート」で決めた親フォルダの下の、このプロジェクトの名前のフォルダで、書く・選ぶとこのプロジェクトだけ別の場所（チームで共有しているフォルダなど）にできます。変えても、いまあるノートは動かしません。プロジェクトフォルダを変えても変わりません。チャットで「ノート」「ノートフォルダ」と言えば、AI はここのことだと分かります。"
      value={project.note_dir}
      fallback={project.note_dir ? "" : (dir ?? "")}
      onSave={(next) => api.updateProject(project.id, { note_dir: next })}
      overlapExcept={project.id}
    />
  );
}
