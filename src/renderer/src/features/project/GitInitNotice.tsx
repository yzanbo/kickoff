import { GitBranch } from "lucide-react";
import { useState } from "react";
import { api } from "@/api";
import { confirmDialog, reportFailure } from "@/ui/dialogs";
import { EmptyState } from "@/ui/EmptyState";

/** git の管理を始めたときに増えること（確かめの文・案内で共通） */
export const GIT_FEATURES = "ワークツリー（チャットごとの作業場所）・変更の差分・コミット・履歴";

/**
 * 確かめてから、プロジェクトのフォルダで git の管理を始める（main で初期化し、いまあるファイルで最初のコミットを作る）。
 * 始めたら true（呼ぶ側で Git の状態を取り直す）
 */
export async function startProjectGit(projectId: number): Promise<boolean> {
  const ok = await confirmDialog({
    title: "git の管理を始めますか？",
    message: `プロジェクトのフォルダを git のリポジトリとして初期化し、いまあるファイルをすべて最初のコミットにします。\n秘密の情報（.env など）があれば、先に .gitignore に書いてください。\n始めると、${GIT_FEATURES}が使えます。`,
    confirmLabel: "git の管理を始める",
  });
  if (!ok) return false;
  try {
    await api.initProjectGit(projectId);
    return true;
  } catch (e) {
    await reportFailure("git の管理を始められませんでした")(e);
    return false;
  }
}

/**
 * git で管理していないプロジェクトの案内（ファイル・変更・履歴のタブ、右の欄の「変更」）と「git の管理を始める」ボタン。
 * 始めたら onStarted（Git の状態を取り直す）
 */
export function GitInitNotice({ projectId, onStarted, className }: { projectId: number; onStarted: () => void; className?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <EmptyState
      icon={GitBranch}
      title="git で管理していないフォルダです"
      className={className}
      actions={
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const started = await startProjectGit(projectId);
            setBusy(false);
            if (started) onStarted();
          }}
        >
          git の管理を始める…
        </button>
      }
    >
      {GIT_FEATURES}は、git で管理しているフォルダで使えます。チャットはこのままでも使えます。
    </EmptyState>
  );
}
