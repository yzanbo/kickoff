// git がプロジェクトの画面の表（projectViews）に出す画面: 変更（数のバッジ = 変更のあるファイルの数）・履歴
import { FileDiff, History } from "lucide-react";
import type { ProjectViewDef } from "@/features/projects/ui";
import type { ChatSideAdd } from "@/features/chatPanel/ui";
import { changesTab, openTab } from "@/features/panel/ui";
import { EditorViewPage } from "@/features/files/ui";
import { HistoryViewPage, useChangesBadge } from "./projectViewPages";

export const changesView: ProjectViewDef = {
  id: "changes",
  label: "変更",
  icon: FileDiff,
  group: "code",
  order: 50,
  places: ["center", "rightSidebar"],
  followsWorkplace: true,
  // ファイル・検索と同じ部品（行き来しても作り直さない）
  Page: EditorViewPage,
  useBadge: useChangesBadge,
};

export const historyView: ProjectViewDef = {
  id: "history",
  label: "履歴",
  icon: History,
  group: "code",
  order: 60,
  places: ["center", "rightSidebar", "chatSide"],
  followsWorkplace: true,
  Page: HistoryViewPage,
};

/** チャットの右の欄の「＋ ▾」の変更: 右の欄向けの変更のタブ（種類 changes。チャットの作業場所のコミットしていない変更） */
export const changesChatSideAdd: ChatSideAdd = {
  view: "changes",
  title: "このチャットの作業場所の、コミットしていない変更を開く",
  open: ({ chat, panelKey }) => openTab(panelKey, changesTab({ chatId: chat.id, projectId: chat.project_id, ...(chat.worktree_path ? { worktree: chat.worktree_path } : {}) })),
};
