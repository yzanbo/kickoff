import { Bot, FileText, GitPullRequest, Library, MessageSquareQuote, Shrink, Trash2 } from "lucide-react";
import type { Project } from "@shared/projects/types";
import { useAppSettings } from "@/features/settings/ui/stores/settings";
import type { DialogSection } from "@/foundation/ui/kit/TabbedDialog";
import { CompactPromptSettings } from "@/features/compact/ui/CompactPromptSettings";
import { SnippetSettings } from "@/features/snippets/ui/SnippetSettings";
import { AiSection } from "./AiSection";
import { BasicInfo } from "./BasicInfo";
import { DeleteProject } from "./DeleteProject";
import { GitHubSection } from "./GitHubSection";
import { ReferenceEditor } from "./ReferenceEditor";

export type ProjectSettingsSection = "basic" | "refs" | "ai" | "github" | "snippets" | "compact" | "danger";

export const PROJECT_SETTINGS_SECTIONS: DialogSection<ProjectSettingsSection>[] = [
  { key: "basic", label: "基本情報", icon: FileText },
  { key: "refs", label: "参照資料", icon: Library },
  { key: "ai", label: "AI", icon: Bot },
  { key: "github", label: "GitHub", icon: GitPullRequest },
  { key: "snippets", label: "定型文", icon: MessageSquareQuote },
  { key: "compact", label: "圧縮前・圧縮後指示", icon: Shrink },
  { key: "danger", label: "削除", icon: Trash2, danger: true },
];

/**
 * プロジェクトの設定の、選んでいる項目の内容（プロジェクト名の横の「編集」から開くダイアログの右側）。
 * 基本情報（ノートフォルダも）・参照資料・AI・GitHub（使うアカウント・連携先・PR の見張り）・定型文・圧縮前・圧縮後指示・削除
 */
export function ProjectSettings({ project, section }: { project: Project; section: ProjectSettingsSection }) {
  const settings = useAppSettings();
  return (
    <>
      {section === "basic" && <BasicInfo project={project} />}
      {section === "refs" && (
        <section className="section">
          <h2>参照資料</h2>
          <p className="muted small">
            このプロジェクトのチャットで AI がいつでも読めるフォルダ・ファイルです。AI には一覧が伝わり、必要に応じて中身を読みます（書き込みはできません）。
          </p>
          <ReferenceEditor project={project} />
        </section>
      )}
      {section === "ai" && <AiSection project={project} app={settings.data} />}
      {section === "github" && <GitHubSection project={project} />}
      {section === "snippets" && <SnippetSettings projectId={project.id} />}
      {section === "compact" && <CompactPromptSettings projectId={project.id} />}
      {section === "danger" && <DeleteProject project={project} />}
    </>
  );
}
