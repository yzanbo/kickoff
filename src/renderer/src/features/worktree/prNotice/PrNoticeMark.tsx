import { GitMerge, GitPullRequestClosed } from "lucide-react";
import type { KeyboardEvent, MouseEvent } from "react";
import type { WorktreePrNotice } from "@shared/types";
import { cx } from "@/lib/cx";
import { tipProps } from "@/ui/HoverTip";
import { useWorktreePrLookup } from "@/stores/worktreePrs";
import { openPrNotice } from "./PrNoticeDialog";
import { prNoticeMarkLabel, prNoticeTitle } from "./prNoticePlan";

/**
 * ワークツリーの PR がマージされた・閉じられた印（「マージ済み」「閉じた」。片付けるまで出す）。押すと片付けの確認を開く。
 * チャットの行・カードの中にも置くので、押してもその行を開かない（ボタンの中に置けるよう span の role="button"）
 */
export function PrNoticeMark({ notice, iconOnly = false }: { notice: WorktreePrNotice; iconOnly?: boolean }) {
  const Icon = notice.pr.state === "MERGED" ? GitMerge : GitPullRequestClosed;
  const open = (e: MouseEvent | KeyboardEvent) => {
    e.stopPropagation();
    e.preventDefault();
    openPrNotice(notice);
  };
  return (
    <span
      role="button"
      tabIndex={0}
      className={cx("pr-notice-mark", notice.pr.state === "MERGED" ? "merged" : "closed", iconOnly && "icon-only")}
      aria-label={`${prNoticeTitle(notice)}（押すと片付けの確認を開きます）`}
      {...tipProps(`${prNoticeTitle(notice)}（押すと、ワークツリーとチャットを片付ける確認を開きます）`)}
      onClick={open}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && open(e)}
    >
      <Icon size={11} aria-hidden />
      {!iconOnly && <span>{prNoticeMarkLabel(notice)}</span>}
    </span>
  );
}

/** 作業場所（ワークツリーのフォルダ）に知らせがあれば印を出す */
export function WorktreePrMark({ worktree, iconOnly }: { worktree: string | null | undefined; iconOnly?: boolean }) {
  const notice = useWorktreePrLookup()(worktree);
  return notice ? <PrNoticeMark notice={notice} iconOnly={iconOnly} /> : null;
}
