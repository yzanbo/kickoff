import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { GITHUB_MERGE_METHOD_LABELS, type GitHubMergeMethod, type GitHubPullDetail } from "@shared/types";
import { api } from "@/api";
import { useAction } from "@/hooks/useAction";
import { useModalDialog } from "@/hooks/useModalDialog";
import { useSetting } from "@/hooks/useSetting";
import { githubMergeMethod } from "@/lib/storageKeys";
import { cx } from "@/lib/cx";
import { useProjects } from "@/stores/projects";
import { DialogActions } from "@/ui/DialogActions";
import { ErrorText } from "@/ui/ErrorText";
import { reportFailure } from "@/ui/dialogs";
import { confirmRemoveWorktree } from "@/features/worktree/removeWorktree";
import { mergeWarnings, pickMergeMethod } from "./githubMerge";

/**
 * PR のマージの確認（要件 5.11 の段階 3・決定 ⑦。取り消せないので、いつもこの確認を挟む）: 方式（リポジトリが許すものだけ。前回の方式を覚える）を選び、
 * CI が落ちている・承認がない・ブランチが古い・衝突などを目立たせる（`mergeWarnings`）。GitHub の保護ルールで断られたら、その理由をそのまま出す。
 * 見ていた最新のコミット（head_sha）で頼むので、確認のあとに積まれたコミットがあれば GitHub が断る。
 * マージしたら片付けへ: PR の見張り（pr_watch）がオンならコアがその場で聞き直し、ワークツリーがあれば「片付ける」の確認が出る（PrNoticeHost）。
 * 見張りを切っていれば、そのブランチのワークツリーを消す確認（confirmRemoveWorktree）をここから出す
 */
export function MergeDialog({ projectId, detail, onMerged, onClose }: { projectId: number; detail: GitHubPullDetail; onMerged: () => void; onClose: () => void }) {
  const dialog = useModalDialog({ closeOnBackdrop: false });
  const [remembered, setRemembered] = useSetting(githubMergeMethod(projectId));
  const [method, setMethod] = useState<GitHubMergeMethod | null>(() => pickMergeMethod(remembered, detail.merge_methods));
  const action = useAction();
  const { projectsById } = useProjects();
  const warnings = mergeWarnings(detail);
  const { item } = detail;

  const merge = () =>
    method &&
    void action.run(
      "merge",
      async () => {
        await api.githubMerge(projectId, item.number, { method, sha: detail.head_sha });
        setRemembered(method);
        dialog.close();
        onMerged();
        if (projectsById.get(projectId)?.pr_watch === false) void offerWorktreeCleanup(projectId, detail).catch(reportFailure("ワークツリーを片付けられませんでした"));
      },
      { keepBusy: true },
    );

  return (
    <dialog ref={dialog.ref} className="dialog app-dialog github-merge" onClose={onClose}>
      <form
        className="app-dialog-body"
        onSubmit={(e) => {
          e.preventDefault();
          merge();
        }}
      >
        <h2 className="app-dialog-title">
          PR #{item.number} をマージしますか？
        </h2>
        <p className="app-dialog-message">
          「{item.title}」を <code>{item.head_ref}</code> から <code>{item.base_ref}</code> へマージします。マージは取り消せません。
        </p>
        {warnings.length > 0 && (
          <ul className="github-merge-warnings">
            {warnings.map((w) => (
              <li key={w.text} className={cx("github-merge-warning", w.level)}>
                <TriangleAlert size={13} aria-hidden /> {w.text}
              </li>
            ))}
          </ul>
        )}
        {detail.merge_methods.length === 0 ? (
          <ErrorText message="このリポジトリはどのマージの方式も許していません（GitHub のリポジトリの設定を確かめてください）" />
        ) : (
          <fieldset className="github-merge-methods">
            <legend className="field-label">マージの方式</legend>
            {detail.merge_methods.map((m) => (
              <label key={m} className="github-merge-method">
                <input type="radio" name="merge-method" checked={method === m} onChange={() => setMethod(m)} />
                {GITHUB_MERGE_METHOD_LABELS[m]}
              </label>
            ))}
          </fieldset>
        )}
        <ErrorText message={action.error} />
        <DialogActions onCancel={() => dialog.close()} submit={{ label: "マージする", busyLabel: "マージしています…", busy: action.busy !== null, disabled: method === null }} />
      </form>
    </dialog>
  );
}

/** マージした PR のブランチのワークツリー（同じ名前か、ほかの人の fork なら pr-N）があれば、消す確認を出す */
async function offerWorktreeCleanup(projectId: number, detail: GitHubPullDetail) {
  const branches = [detail.item.head_ref, `pr-${detail.item.number}`];
  const worktree = (await api.gitWorktrees(projectId)).find((w) => !w.main && !w.prunable && w.branch !== null && branches.includes(w.branch));
  if (worktree) await confirmRemoveWorktree(projectId, worktree, worktree.branch ?? worktree.path);
}
