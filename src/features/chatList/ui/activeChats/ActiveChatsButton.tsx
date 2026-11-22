import { Activity } from "lucide-react";
import type { Project } from "@shared/projects/types";
import { ACTIVE_CHATS_LABEL } from "@/features/projects/ui";
import { cx } from "@/foundation/ui/lib/cx";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import { openActiveChats } from "./openActiveChats";
import type { WaitingBadge } from "./useAllWaiting";


/**
 * ⌘⇧A の一覧を、そのプロジェクトに絞り込んだところから開くボタン（サイドバーのプロジェクトのカード。アイコンは ⌘⇧A の一覧の入力欄と同じ Activity）。
 * プロジェクトの見出しの右端の、すべてのプロジェクトの状態ごとのチャットは AllStateChats
 */
export function ActiveChatsButton({ project, iconSize, className }: { project: Pick<Project, "id" | "name">; iconSize?: number; className?: string }) {
  return (
    <IconButton
      icon={Activity}
      iconSize={iconSize}
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
