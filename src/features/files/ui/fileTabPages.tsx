// ファイルのタブの中身と見た目（種類の項目は fileTabKinds.ts）
import { type PanelTab, type TabFaceProps, type TabPageProps } from "@/features/panel/ui";
import { ProjectFileTab } from "./ProjectFileTab";
import { SideFileView } from "./SideFileView";
import { useFileTabDirty } from "./fileTabs";

export type FileTab = Extract<PanelTab, { kind: "file" }>;
export type ProjectFileTabData = Extract<PanelTab, { kind: "projectFile" }>;

export const FilePage = ({ tab: t, panel }: TabPageProps<FileTab>) => <SideFileView projectId={t.projectId} worktree={t.worktree} path={t.path} line={t.line} tabOf={{ panelKey: panel.key, tabKey: t.key }} />;

// プロジェクトの「ファイル」「検索」「変更」タブの右だけに開く（中身が使う Git の状態などは EditorTab が FileTabsContext で渡す）
export const ProjectFilePage = ({ tab: t, panel }: TabPageProps<ProjectFileTabData>) => <ProjectFileTab tab={t} panelKey={panel.key} />;

/** 保存していない変更があれば × の代わりに「●」（乗せると ×。VS Code と同じ） */
export function ProjectFileFace({ tab, panel, base, render }: TabFaceProps<ProjectFileTabData>) {
  const dirty = useFileTabDirty(panel.key, tab.key);
  return render({ dirty, closeLabel: dirty ? `${base.label} のタブを閉じる（保存していない変更があります）` : undefined });
}

