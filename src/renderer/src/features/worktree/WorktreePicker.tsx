import { GitBranch } from "lucide-react";
import { useEffect } from "react";
import type { GitWorktree } from "@shared/types";
import { cx } from "@/lib/cx";
import { baseName } from "@/lib/format";
import { useWorktreePrLookup } from "@/stores/worktreePrs";
import { useWorktrees, worktreesStore } from "@/stores/worktrees";
import { prNoticeMarkLabel } from "./prNotice/prNoticePlan";

/** ワークツリーの短い名前（ブランチ名。なければフォルダ名） */
export const worktreeLabel = (w: Pick<GitWorktree, "branch" | "root">) => w.branch ?? baseName(w.root);

/**
 * ファイルタブで見る作業場所（本体・ワークツリー）を選ぶ。ワークツリーが本体だけなら出さない。
 * 選んでいたワークツリーがなくなったら、本体に戻す。PR がマージされた・閉じられたワークツリーは、選択肢の名前に（マージ済み）などを添える
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
  const prNotice = useWorktreePrLookup();
  useEffect(() => worktreesStore.ensure(projectId), [projectId, version]);
  useEffect(() => {
    if (worktrees && value && !worktrees.some((w) => w.path === value && !w.main)) onChange(undefined);
  }, [worktrees, value, onChange]);
  if (!worktrees || worktrees.length <= 1) return null;
  return (
    <label className={cx("new-chat-group worktree-picker", value && "has-group")} title="作業場所（ワークツリー）を選ぶ">
      <GitBranch size={12} aria-hidden />
      <select className="pill-select" aria-label="作業場所" value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)}>
        {worktrees.map((w) => {
          const notice = w.main ? undefined : prNotice(w.path);
          return (
            <option key={w.path} value={w.main ? "" : w.path}>
              {w.main ? `本体（${worktreeLabel(w)}）` : worktreeLabel(w)}
              {notice ? `（${prNoticeMarkLabel(notice)}）` : ""}
            </option>
          );
        })}
      </select>
    </label>
  );
}
