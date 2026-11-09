import { Activity } from "lucide-react";
import type { Project } from "@shared/types";
import { cx } from "@/lib/cx";
import { IconButton } from "@/ui/IconButton";
import { openActiveChats } from "./openActiveChats";

/** プロジェクトの作業中・待ちのチャットの一覧のボタンの文（右クリックのメニューの項目と同じ） */
export const ACTIVE_CHATS_LABEL = "作業中・待ちのチャットを一覧";

/** ボタンの右上に重ねる要対応の数（回答待ち・未読。urgent = 回答待ちがあるか。色を回答待ちのオレンジにする） */
interface WaitingBadge {
  count: number;
  urgent: boolean;
}

/**
 * このプロジェクトに絞り込んだ ⌘⇧A の一覧を開くボタン（アイコンは ⌘⇧A の一覧の入力欄と同じ Activity）。
 * サイドバーのプロジェクトのカードとプロジェクト画面の見出しに置く（利用者の依頼）。
 * waiting を渡すと、要対応の数を右上に重ねる（0 なら出さない。プロジェクト画面の見出し。利用者の依頼）
 */
export function ActiveChatsButton({
  project,
  size,
  className,
  waiting,
}: {
  project: Pick<Project, "id" | "name">;
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
      label={`${project.name} の${ACTIVE_CHATS_LABEL}${note}`}
      title={`${ACTIVE_CHATS_LABEL}${note}（下書き・作業中・回答待ち・未読。⌘⇧A の一覧をこのプロジェクトで絞り込んで開く）`}
      aria-haspopup="dialog"
      onClick={() => openActiveChats({ projectId: project.id })}
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
