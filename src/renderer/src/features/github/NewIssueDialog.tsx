import { useState } from "react";
import { X } from "lucide-react";
import { api } from "@/api";
import { useAction } from "@/hooks/useAction";
import { useAsync } from "@/hooks/useAsync";
import { useModalDialog } from "@/hooks/useModalDialog";
import { DialogActions } from "@/ui/DialogActions";
import { ErrorText } from "@/ui/ErrorText";
import { GitHubLabelPicker } from "./GitHubLabelPicker";
import { GitHubMarkdownField } from "./GitHubMarkdownField";

/**
 * 新しい issue（要件 5.11 の段階 3。GitHub タブの「新しい issue」と、メモ・チャットの発言の右クリックの「issue にする」から）:
 * 題名・本文（Markdown。書く｜プレビュー）・ラベル・担当を決めて、プロジェクトの連携先に作る。「issue にする」は選んだ文か全体を本文に入れておき、作る前に直せる。
 * 作ったら onCreated（GitHub タブはその issue を開く）。連携先が使えなければ、その理由を出して作らせない
 */
export function NewIssueDialog({ projectId, initialBody, onCreated, onClose }: { projectId: number; initialBody: string; onCreated?: (number: number) => void; onClose: () => void }) {
  const dialog = useModalDialog({ closeOnBackdrop: false });
  const connection = useAsync(() => api.githubConnection(projectId), [projectId]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState(initialBody);
  const [labels, setLabels] = useState<string[]>([]);
  const [assignees, setAssignees] = useState<string[]>([]);
  const action = useAction();
  const reason = connection.data?.reason ?? null;
  const ready = connection.data !== undefined && reason === null;

  const submit = () =>
    ready &&
    title.trim() &&
    void action.run(
      "create",
      async () => {
        const created = await api.githubCreateIssue(projectId, { title: title.trim(), body, labels, assignees });
        dialog.close();
        onCreated?.(created.number);
      },
      { keepBusy: true },
    );

  const chips = (names: string[], remove: (name: string) => void, what: string) =>
    names.map((n) => (
      <span key={n} className="github-picked-chip">
        {n}
        <button type="button" className="github-picked-remove" aria-label={`${what}「${n}」を外す`} onClick={() => remove(n)}>
          <X size={11} aria-hidden />
        </button>
      </span>
    ));

  return (
    <dialog ref={dialog.ref} className="dialog app-dialog github-new-issue" onClose={onClose}>
      <form
        className="app-dialog-body"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <h2 className="app-dialog-title">新しい issue{connection.data?.repo ? <span className="muted small">（{connection.data.repo}）</span> : null}</h2>
        {reason && <ErrorText message={reason} />}
        <label className="field">
          <span className="field-label">題名</span>
          <input type="text" value={title} autoFocus placeholder="何が起きているか・やりたいこと" onChange={(e) => setTitle(e.target.value)} maxLength={256} />
        </label>
        <div className="field">
          <span className="field-label">本文</span>
          <GitHubMarkdownField value={body} onChange={setBody} label="本文" placeholder="詳しいこと（Markdown）" onSubmit={submit} minRows={8} />
        </div>
        <div className="github-new-issue-pickers">
          <GitHubLabelPicker projectId={projectId} selected={labels} onCommit={setLabels} disabled={!ready} />
          {chips(labels, (n) => setLabels(labels.filter((x) => x !== n)), "ラベル")}
          <GitHubLabelPicker projectId={projectId} kind="assignees" selected={assignees} onCommit={setAssignees} disabled={!ready} />
          {chips(assignees, (n) => setAssignees(assignees.filter((x) => x !== n)), "担当")}
        </div>
        <ErrorText message={action.error} />
        <DialogActions onCancel={() => dialog.close()} submit={{ label: "issue を作る", busyLabel: "作っています…", busy: action.busy !== null, disabled: !ready || !title.trim() }} />
      </form>
    </dialog>
  );
}
