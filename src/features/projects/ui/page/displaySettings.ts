// projects がアプリの設定に出す欄: 「表示」のプロジェクトの見出し・プロジェクトのタブ・チャットを開く場所
import type { SettingsItemDef } from "@/features/settings/ui";
import { ChatPlacementField, ProjectHeaderField, ProjectTabsField } from "./DisplayFields";

export const projectsDisplayItems: SettingsItemDef[] = [
  { id: "projects.header", section: "display", order: 170, Component: ProjectHeaderField },
  { id: "projects.tabs", section: "display", order: 180, Component: ProjectTabsField },
  { id: "projects.chatPlacement", section: "display", order: 190, Component: ChatPlacementField },
];
