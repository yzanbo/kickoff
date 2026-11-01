import type { Project } from "../../../../core/types";
import { api } from "../../api";
import { confirmDialog } from "../../dialogs";
import { useActionError } from "../../hooks/useActionError";
import { navigate } from "../../router";
import { ErrorText } from "../ErrorText";

export function DeleteProject({ project }: { project: Project }) {
  const { error, guard } = useActionError();
  const remove = async () => {
    const ok = await confirmDialog({
      title: `プロジェクト「${project.name}」を削除しますか？`,
      message: `チャット・グループ・タスク・要件定義書などの Kickoff 上の記録は消えます。フォルダとリポジトリ（${project.repo_path}）は削除されません。`,
      confirmLabel: "削除",
      danger: true,
    });
    if (!ok) return;
    await guard(async () => {
      await api.deleteProject(project.id);
      navigate({ name: "home" });
    });
  };
  return (
    <section className="section danger-zone">
      <h2>プロジェクトの削除</h2>
      <p className="muted small">
        Kickoff 上の記録（チャット・グループ・タスク・要件定義書など）を消します。フォルダとリポジトリは削除されないので、あとから取り込み直せます。
      </p>
      <button className="btn btn-danger" onClick={() => void remove()}>
        プロジェクトを削除
      </button>
      <ErrorText message={error} />
    </section>
  );
}
