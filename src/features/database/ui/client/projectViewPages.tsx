// database がプロジェクトの画面の表（projectViews）に出す画面の中身
import type { ProjectViewContext } from "@/features/projects/ui";
import type { ChatSideAddProps } from "@/features/chatPanel/ui";
import { DbMenuItems } from "@/features/database/ui/connection/DbMenuItems";
import { LazyDatabaseClient } from "./LazyDatabaseClient";

/**
 * SQLite のファイルは、見ている作業場所の中を開く。開いているタブ・木の開き具合は置き場所ごとに覚える（真ん中 = プロジェクト、右サイドバー = プロジェクトの右サイドバー、
 * チャットの右の欄 = チャット。右の欄は別ウィンドウと同じ）。右サイドバーは作業場所を変えたら初めから
 */
export function DatabaseViewPage({ place, project, chatId, worktree }: ProjectViewContext) {
  if (place === "center") return <LazyDatabaseClient key={project.id} projectId={project.id} surface={{ kind: "project", projectId: project.id }} worktree={worktree} />;
  return <LazyDatabaseClient key={worktree ?? ""} projectId={project.id} surface={place === "rightSidebar" ? { kind: "side", projectId: project.id } : { kind: "chat", chatId: chatId ?? 0 }} worktree={worktree} />;
}

/** チャットの右の欄の「＋ ▾」の DB: DB クライアントと、接続ごとの新しい SQL のタブを横に並べる（開いているタブはチャットごとに覚える） */
export const DbSubmenu = ({ chat, openView }: ChatSideAddProps) => <DbMenuItems projectId={chat.project_id} surface={{ kind: "chat", chatId: chat.id }} onOpen={openView} />;
