import { Bot, FileText, FolderLock, Library, MessageSquarePlus, Trash2 } from "lucide-react";
import type { Project } from "../../../../core/types";
import { api } from "../../api";
import { useAsync } from "../../hooks/useAsync";
import type { DialogSection } from "../TabbedDialog";
import { AiSection } from "./AiSection";
import { BasicInfo } from "./BasicInfo";
import { ChatDefaults } from "./ChatDefaults";
import { DeleteProject } from "./DeleteProject";
import { ReferenceEditor } from "./ReferenceEditor";
import { WriteScopeEditor } from "./WriteScopeEditor";

export type ProjectSettingsSection = "basic" | "refs" | "ai" | "chat" | "scope" | "danger";

export const PROJECT_SETTINGS_SECTIONS: DialogSection<ProjectSettingsSection>[] = [
  { key: "basic", label: "基本情報", icon: FileText },
  { key: "refs", label: "参照資料", icon: Library },
  { key: "ai", label: "AI", icon: Bot },
  { key: "chat", label: "新しいチャット", icon: MessageSquarePlus },
  { key: "scope", label: "書き込みできるフォルダ", icon: FolderLock },
  { key: "danger", label: "削除", icon: Trash2, danger: true },
];

/**
 * プロジェクトの設定の、選んでいる項目の内容（プロジェクト名の横の「編集」から開くダイアログの右側）。
 * 基本情報・参照資料・AI・新しいチャットの既定・書き込みできるフォルダ・削除
 */
export function ProjectSettings({ project, section }: { project: Project; section: ProjectSettingsSection }) {
  const settings = useAsync(api.settings);
  return (
    <>
      {section === "basic" && <BasicInfo project={project} />}
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
      {section === "chat" && <ChatDefaults project={project} />}
      {section === "scope" && (
        <section className="section">
          <h2>書き込みできるフォルダ</h2>
          <p className="muted small">
            要件定義・スケジュールのチャットで AI が書き込めるフォルダです。ここ以外への書き込みと読み取り以外のコマンドは、権限モードに関係なく拒否されます。
          </p>
          <WriteScopeEditor project={project} />
        </section>
      )}
      {section === "danger" && <DeleteProject project={project} />}
    </>
  );
}
