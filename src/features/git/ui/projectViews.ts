// git がプロジェクトの画面の表（projectViews）に出す画面: 変更（数のバッジ = 変更のあるファイルの数）・履歴
import { FileDiff, History } from "lucide-react";
import type { ProjectViewDef } from "@/features/projects/ui";
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
