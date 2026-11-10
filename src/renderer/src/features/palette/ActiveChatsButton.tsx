import { Activity } from "lucide-react";
import type { Project } from "@shared/types";
import { cx } from "@/lib/cx";
import { IconButton } from "@/ui/IconButton";
import { openActiveChats } from "./openActiveChats";
import type { WaitingBadge } from "./useAllWaiting";

/** プロジェクトの作業中・待ちのチャットの一覧のボタンの文（右クリックのメニューの項目と同じ） */
export const ACTIVE_CHATS_LABEL = "作業中・待ちのチャットを一覧";

/**
 * ⌘⇧A の一覧を開くボタン（アイコンは ⌘⇧A の一覧の入力欄と同じ Activity）。
 * project を渡すとそのプロジェクトに絞り込んだところから開く（サイドバーのプロジェクトのカード。利用者の依頼）。
 * 省くと「すべて」のプロジェクトから開く（プロジェクト画面の見出し。ほかのプロジェクトに要対応があるかを見るため。利用者の依頼）。
 * waiting を渡すと、要対応の数を右上に重ねる（0 なら出さない）
 */
export function ActiveChatsButton({
  project,
  size,
  className,
  waiting,
}: {
  project?: Pick<Project, "id" | "name">;
  size?: number;
  className?: string;
  waiting?: WaitingBadge;
}) {
  const shown = waiting && waiting.count > 0 ? waiting : null;
  const note = shown ? `（要対応 ${shown.count} 件）` : "";
  const button = (
    <IconButton
      icon={Activity}
      size={size}
      className={className}
      label={`${project ? `${project.name} の` : "すべてのプロジェクトの"}${ACTIVE_CHATS_LABEL}${note}`}
      title={
        project
          ? `${ACTIVE_CHATS_LABEL}${note}（下書き・作業中・回答待ち・未読。⌘⇧A の一覧をこのプロジェクトで絞り込んで開く）`
          : `すべてのプロジェクトの${ACTIVE_CHATS_LABEL}${note}（下書き・作業中・回答待ち・未読。⌘⇧A の一覧を「すべて」で開く。数はすべてのプロジェクトの回答待ち・未読）`
      }
      aria-haspopup="dialog"
      onClick={() => openActiveChats(project ? { projectId: project.id } : {})}
    />
  );
  if (waiting === undefined) return button;
  return (
    <span className="active-chats-button">
      {button}
      {shown && (
        <span className={cx("active-chats-badge", shown.urgent && "urgent")} aria-hidden>
          {shown.count > 99 ? "99+" : shown.count}
        </span>
      )}
    </span>
  );
}
