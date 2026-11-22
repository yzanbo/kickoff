// 変更のタブの中身（種類の項目は changesTabKind.ts）。チャットの画面の右の欄だけに開く、作業場所のコミットしていない変更（押したファイルの位置へ移る）
import type { PanelTab, TabPageProps } from "@/features/panel/ui";
import { SideChanges } from "./SideChanges";

export type ChangesTab = Extract<PanelTab, { kind: "changes" }>;

export const ChangesPage = ({ tab: t }: TabPageProps<ChangesTab>) => <SideChanges projectId={t.projectId} worktree={t.worktree} focus={t.focus} focusAt={t.focusAt} />;
