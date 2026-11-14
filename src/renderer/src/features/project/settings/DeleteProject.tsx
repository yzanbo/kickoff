import type { Project } from "@shared/types";
import { api } from "@/api";
import { confirmDialog } from "@/ui/dialogs";
import { useAction } from "@/hooks/useAction";
import { navigate } from "@/app/router";
import { ErrorText } from "@/ui/ErrorText";
import { showTrashedToast } from "@/features/trash/trashActions";

export function DeleteProject({ project }: { project: Project }) {
  const { error, guard } = useAction();
  const remove = async () => {
    const ok = await confirmDialog({
      title: `プロジェクト「${project.name}」を削除しますか？`,
      message: `チャット・グループなどの Kickoff 上の記録ごと Kickoff のゴミ箱に 3 日入り、その間は戻せます（3 日たつと会話の記録・添付ごと消えます）。フォルダとリポジトリ（${project.repo_path}）は削除されません。作業中のチャットがあると削除できません。`,
      confirmLabel: "削除",
      danger: true,
    });
    if (!ok) return;
    await guard(async () => {
      const { trash_id } = await api.deleteProject(project.id);
      navigate({ name: "allProjects" });
      showTrashedToast(trash_id, project.name);
    });
  };
  return (
    <section className="section danger-zone">
      <h2>プロジェクトの削除</h2>
      <p className="muted small">
        Kickoff 上の記録（チャット・グループなど）をゴミ箱に入れます（3 日は戻せます）。フォルダとリポジトリは削除されないので、あとから取り込み直せます。
      </p>
      <button className="btn btn-danger" onClick={() => void remove()}>
        プロジェクトを削除
      </button>
      <ErrorText message={error} />
    </section>
  );
}
