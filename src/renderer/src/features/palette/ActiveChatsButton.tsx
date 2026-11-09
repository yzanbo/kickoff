import { Activity } from "lucide-react";
import type { Project } from "@shared/types";
import { IconButton } from "@/ui/IconButton";
import { openActiveChats } from "./openActiveChats";

/** プロジェクトの作業中・待ちのチャットの一覧のボタンの文（右クリックのメニューの項目と同じ） */
export const ACTIVE_CHATS_LABEL = "作業中・待ちのチャットを一覧";

/**
 * このプロジェクトに絞り込んだ ⌘⇧A の一覧を開くボタン（アイコンは ⌘⇧A の一覧の入力欄と同じ Activity）。
 * サイドバーのプロジェクトのカードとプロジェクト画面の見出しに置く（利用者の依頼）
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
