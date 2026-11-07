import { Bot, FileText, Library, MessageSquareQuote, StickyNote, Trash2 } from "lucide-react";
import type { Project } from "@shared/types";
import { useAppSettings } from "@/stores/settings";
import type { DialogSection } from "@/ui/TabbedDialog";
import { SnippetSettings } from "@/features/snippet/SnippetSettings";
import { AiSection } from "./AiSection";
import { BasicInfo } from "./BasicInfo";
import { DeleteProject } from "./DeleteProject";
import { MemoLocation } from "./MemoLocation";
import { ReferenceEditor } from "./ReferenceEditor";

export type ProjectSettingsSection = "basic" | "refs" | "ai" | "memos" | "snippets" | "danger";

export const PROJECT_SETTINGS_SECTIONS: DialogSection<ProjectSettingsSection>[] = [
  { key: "basic", label: "基本情報", icon: FileText },
  { key: "refs", label: "参照資料", icon: Library },
  { key: "ai", label: "AI", icon: Bot },
  { key: "memos", label: "メモ", icon: StickyNote },
  { key: "snippets", label: "定型文", icon: MessageSquareQuote },
  { key: "danger", label: "削除", icon: Trash2, danger: true },
];

/**
 * プロジェクトの設定の、選んでいる項目の内容（プロジェクト名の横の「編集」から開くダイアログの右側）。
 * 基本情報・参照資料・AI・メモ・定型文・削除
 */
export function ProjectSettings({ project, section, onSelect }: { project: Project; section: ProjectSettingsSection; onSelect: (section: ProjectSettingsSection) => void }) {
  const settings = useAppSettings();
  return (
    <>
      {section === "basic" && <BasicInfo project={project} onOpenMemos={() => onSelect("memos")} />}
      {section === "refs" && (
        <section className="section">
          <h2>参照資料</h2>
          <p className="muted small">
            く、このプロジェクトのチャットで AI がいつでも読めるフォルダ・ファイルです。AI には一覧が伝わり、必要に応じて中身を読みます（書き込みはできません）。
          </p>
          <ReferenceEditor project={project} />
        </section>
      )}
      {section === "ai" && <AiSection project={project} app={settings.data} />}
      {section === "memos" && <MemoLocation project={project} />}
      {section === "snippets" && <SnippetSettings projectId={project.id} />}
      {section === "danger" && <DeleteProject project={project} />}
    </>
  );
}
