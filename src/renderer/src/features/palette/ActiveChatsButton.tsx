import { Activity } from "lucide-react";
import type { Project } from "@shared/types";
import { cx } from "@/lib/cx";
import { IconButton } from "@/ui/IconButton";
import { openActiveChats } from "./openActiveChats";
import type { WaitingBadge } from "./useAllWaiting";

/** プロジェクトの作業中・待ちのチャットの一覧のボタンの文（右クリックのメニューの項目と同じ） */
export const ACTIVE_CHATS_LABEL = "作業中・待ちのチャットを一覧";

/**
 * ⌘⇧A の一覧を、そのプロジェクトに絞り込んだところから開くボタン（サイドバーのプロジェクトのカード。利用者の依頼。アイコンは ⌘⇧A の一覧の入力欄と同じ Activity）。
 * プロジェクトの見出しの右端の、すべてのプロジェクトの状態ごとのチャットは features/project/page/AllStateChats
 */
export function ActiveChatsButton({ project, size, className }: { project: Pick<Project, "id" | "name">; size?: number; className?: string }) {
  return (
    <IconButton
      icon={Activity}
      size={size}
      className={className}
      label={`${project.name} の${ACTIVE_CHATS_LABEL}`}
      title={`${ACTIVE_CHATS_LABEL}（下書き・作業中・回答待ち・未読。⌘⇧A の一覧をこのプロジェクトで絞り込んで開く）`}
      aria-haspopup="dialog"
      onClick={() => openActiveChats({ projectId: project.id })}
    />
  );
}

/** ボタンの右上に重ねる要対応の数（0 なら出さない。回答待ちがあればオレンジ、なければ緑。置く要素は .active-chats-button） */
export function WaitingCountBadge({ waiting }: { waiting: WaitingBadge }) {
  if (waiting.count === 0) return null;
  return (
    <span className={cx("active-chats-badge", waiting.urgent && "urgent")} aria-hidden>
      {waiting.count > 99 ? "99+" : waiting.count}
    </span>
  );
}
