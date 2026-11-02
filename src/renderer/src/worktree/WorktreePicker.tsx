import { FolderGit2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { GitWorktree } from "../../../core/types";
import { api } from "../api";
import { cx } from "../cx";

/** ワークツリーの短い名前（ブランチ名。なければフォルダ名） */
export const worktreeLabel = (w: Pick<GitWorktree, "branch" | "path">) => w.branch ?? w.path.split("/").pop() ?? w.path;

/** プロジェクトのワークツリー（version が変わったら読み直す） */
export function useWorktrees(projectId: number, version = 0) {
  const [state, setState] = useState<{ projectId: number; list: GitWorktree[] }>();
  useEffect(() => {
    let alive = true;
    api.gitWorktrees(projectId).then(
      (list) => alive && setState({ projectId, list }),
      () => alive && setState({ projectId, list: [] }),
    );
    return () => {
      alive = false;
    };
  }, [projectId, version]);
  return state?.projectId === projectId ? state.list : undefined;
}

/**
 * エディタタブで見る作業場所（本体・ワークツリー）を選ぶ。ワークツリーが本体だけなら出さない。
 * 選んでいたワークツリーがなくなったら、本体に戻す
 */
export function WorktreePicker({
  projectId,
  value,
  onChange,
  version,
}: {
  projectId: number;
  value?: string;
  onChange: (worktree: string | undefined) => void;
  version: number;
}) {
  const worktrees = useWorktrees(projectId, version);
  useEffect(() => {
    if (worktrees && value && !worktrees.some((w) => w.path === value && !w.main)) onChange(undefined);
  }, [worktrees, value, onChange]);
  if (!worktrees || worktrees.length <= 1) return null;
  return (
    <label className={cx("new-chat-group worktree-picker", value && "has-group")} title="作業場所（ワークツリー）を選ぶ">
      <FolderGit2 size={12} aria-hidden />
      <select className="pill-select" aria-label="作業場所" value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)}>
        {worktrees.map((w) => (
          <option key={w.path} value={w.main ? "" : w.path}>
            {w.main ? `本体（${worktreeLabel(w)}）` : worktreeLabel(w)}
          </option>
        ))}
      </select>
    </label>
  );
}
