// ノートのタブの中身（種類の項目は noteTabKind.ts）
import { noteTab, type PanelTab, type TabPageProps } from "@/features/panel/ui";
import { SideNote } from "./SideNote";

export type NoteTab = Extract<PanelTab, { kind: "note" }>;

// 名前を変えたら、新しい名前のノートのタブに置き換える（同じ位置のまま）
export const NotePage = ({ tab: t, panel }: TabPageProps<NoteTab>) => <SideNote projectId={t.projectId} path={t.path} chatId={t.chatId} onRenamed={(to) => panel.replaceTab(t.key, noteTab({ chatId: t.chatId, projectId: t.projectId, path: to }))} />;
