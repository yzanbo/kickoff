import type { Project } from "@shared/types";
import { api } from "@/api";
import { useMemoList } from "@/stores/memos";
import { MemoFolderField } from "@/features/memo/MemoFolderField";

/** プロジェクトの設定: メモの場所（ふだんは設定の親フォルダの下。このプロジェクトだけ別の場所にもできる） */
export function MemoLocation({ project }: { project: Project }) {
  const list = useMemoList(project.id);
  const dir = list.data?.dir;
  return (
    <section className="section">
      <h2>メモ</h2>
      <p className="muted small">
        このプロジェクトの「メモ」タブのメモの保存先です。ふだんは、アプリの設定の「メモ」で決めた親フォルダの下の、このプロジェクトのフォルダに保存します。
      </p>
      {dir && (
        <p className="small memo-dir" title={dir}>
          いまの保存先: {dir}
        </p>
      )}
      <div className="form">
        <MemoFolderField
          label="このプロジェクトだけ別の場所にする"
          help="チームで共有しているフォルダなどを指せます。変えても、いまあるメモは動かしません。"
          value={project.memo_path}
          fallback={project.memo_path ? "" : (dir ?? "")}
          onSave={(next) => api.updateProject(project.id, { memo_path: next })}
        />
      </div>
    </section>
  );
}
