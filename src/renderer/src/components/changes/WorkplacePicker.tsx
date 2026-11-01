import { FolderGit2 } from "lucide-react";
import { cx } from "../../cx";
import { promptDialog } from "../../dialogs";
import { useWorktrees, worktreeLabel } from "./WorktreePicker";

/** 新しいチャットの作業場所（本体・いまあるワークツリー・新しく作るワークツリー） */
export type Workplace = { kind: "main" } | { kind: "existing"; path: string } | { kind: "new"; branch: string };

const NEW = "__new__";

/**
 * 新しいチャットの作業場所を選ぶ（並行開発のため、チャットごとに別のワークツリーで作業させられる）。
 * 「新しいワークツリー…」を選ぶとブランチ名を聞き、チャットを始めるときに作る
 */
export function WorkplacePicker({ projectId, value, onChange }: { projectId: number; value: Workplace; onChange: (place: Workplace) => void }) {
  const worktrees = useWorktrees(projectId);
  if (!worktrees || worktrees.length === 0) return null;
  const current = value.kind === "existing" ? value.path : value.kind === "new" ? NEW : "";

  const choose = async (next: string) => {
    if (next !== NEW) return onChange(next ? { kind: "existing", path: next } : { kind: "main" });
    const branch = await promptDialog({
      title: "新しいワークツリーで始める",
      message: "いまのコミットから新しいブランチを作り、別のフォルダで作業します。ほかのチャットと並行して進めても、ファイルがぶつかりません。",
      label: "ブランチの名前",
      placeholder: "例: feature/login",
      confirmLabel: "決める",
    });
    if (branch) onChange({ kind: "new", branch });
  };

  return (
    <label className={cx("new-chat-group", value.kind !== "main" && "has-group")} title="作業場所（ワークツリー）">
      <FolderGit2 size={12} aria-hidden />
      <select className="pill-select" aria-label="作業場所" value={current} onChange={(e) => void choose(e.target.value)}>
        {worktrees.map((w) => (
          <option key={w.path} value={w.main ? "" : w.path}>
            {w.main ? "本体" : worktreeLabel(w)}
          </option>
        ))}
        {value.kind === "new" && <option value={NEW}>新規: {value.branch}</option>}
        {value.kind !== "new" && <option value={NEW}>＋ 新しいワークツリー…</option>}
      </select>
    </label>
  );
}
