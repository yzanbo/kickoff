// 作業場所の飾り（workplaceDecor）の項目。持ち主（worktrees・github）の ui/contributes.ts へ移すまでの間、組み立てが入れる
import { WorktreePrMark } from "@/features/github/ui/prNotice/PrNoticeMark";
import { prNoticeMarkLabel } from "@/features/github/ui/prNotice/prNoticePlan";
import { worktreePrsStore } from "@/features/github/ui/prNotice/prNoticeStore";
import { worktreeEnvLines } from "@/features/worktrees/ui/worktreeEnvText";
import { workplaceDecor } from "@/foundation/ui/workplace/workplaceDecor";

/** ワークツリーの PR がマージされた・閉じられた印（押すと片付けの確認） */
function PrMark({ path, iconOnly }: { path: string | null; iconOnly?: boolean }) {
  return <WorktreePrMark worktree={path} iconOnly={iconOnly} />;
}

export const workplaceDecorItems = [
  // ワークツリーの実行環境（ポートの帯）: 札の説明にアプリの URL と対応表（db 5432 → 20101）
  workplaceDecor.item({
    id: "worktrees-env",
    lines: (_projectId, path, list) => worktreeEnvLines((path && list?.find((w) => w.path === path)?.env) || null),
  }),
  // ワークツリーの PR の知らせ: 札の後ろの印と、作業場所を選ぶ欄の名前に添える（マージ済み）など
  workplaceDecor.item({
    id: "github-pr",
    Mark: PrMark,
    note: {
      text: (path) => {
        const notice = worktreePrsStore.get().data?.findLast((n) => n.worktree === path);
        return notice ? prNoticeMarkLabel(notice) : null;
      },
      watch: (listener) => {
        const release = worktreePrsStore.retain();
        const off = worktreePrsStore.subscribe(listener);
        return () => {
          off();
          release();
        };
      },
    },
  }),
];
