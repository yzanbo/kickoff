import { GitBranch } from "lucide-react";
import { useEffect } from "react";
import type { GitWorktree } from "@shared/git/types";
import { cx } from "@/foundation/ui/lib/cx";
import { baseName } from "@/foundation/ui/lib/format";
import { useWorktrees, worktreesStore } from "./worktreesStore";
import { useWorkplaceNotes } from "./workplaceDecor";

/** ワークツリーの短い名前（ブランチ名。なければフォルダ名） */
export const worktreeLabel = (w: Pick<GitWorktree, "branch" | "root">) => w.branch ?? baseName(w.root);

/**
 * ファイルタブで見る作業場所（本体・ワークツリー）を選ぶ。ワークツリーが本体だけなら出さない。
 * 選んでいたワークツリーがなくなったら、本体に戻す。PR がマージされた・閉じられたワークツリーは、選択肢の名前に（マージ済み）などを添える（作業場所の飾りの note）
 * （チャットのないワークツリーでも気づけるように。選ぶと右の WorktreeBar に PR の状態と「片付ける」が出る）
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
  // プロジェクトで共通の一覧（変更の一覧を取り直したら、古くなっていれば取り直す）
  const worktrees = useWorktrees(projectId);
  const noteOf = useWorkplaceNotes();
  useEffect(() => worktreesStore.ensure(projectId), [projectId, version]);
  useEffect(() => {
    if (worktrees && value && !worktrees.some((w) => w.path === value && !w.main)) onChange(undefined);
  }, [worktrees, value, onChange]);
  if (!worktrees || worktrees.length <= 1) return null;
  return (
    <label className={cx("new-chat-group pill worktree-picker", value && "has-group")} title="作業場所（ワークツリー）を選ぶ">
      <GitBranch size={12} aria-hidden />
      <select className="pill-select" aria-label="作業場所" value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)}>
        {worktrees.map((w) => {
          const note = w.main ? null : noteOf(w.path);
          return (
            <option key={w.path} value={w.main ? "" : w.path}>
              {w.main ? `本体（${worktreeLabel(w)}）` : worktreeLabel(w)}
              {note ? `（${note}）` : ""}
            </option>
          );
        })}
      </select>
    </label>
  );
}
