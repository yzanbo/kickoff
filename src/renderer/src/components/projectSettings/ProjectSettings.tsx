import { Bot, FileText, FolderLock, Library, MessageSquarePlus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { Project } from "../../../../core/types";
import { api, useAsync } from "../../api";
import { AiSection } from "./AiSection";
import { BasicInfo } from "./BasicInfo";
import { ChatDefaults } from "./ChatDefaults";
import { DeleteProject } from "./DeleteProject";
import { ReferenceEditor } from "./ReferenceEditor";
import { WriteScopeEditor } from "./WriteScopeEditor";

type SectionKey = "basic" | "refs" | "ai" | "chat" | "scope" | "danger";

const SECTIONS: { key: SectionKey; label: string; icon: typeof Bot }[] = [
  { key: "basic", label: "基本情報", icon: FileText },
  { key: "refs", label: "参照資料", icon: Library },
  { key: "ai", label: "AI", icon: Bot },
  { key: "chat", label: "新しいチャット", icon: MessageSquarePlus },
  { key: "scope", label: "書き込みできるフォルダ", icon: FolderLock },
  { key: "danger", label: "削除", icon: Trash2 },
];

/**
 * プロジェクトの設定（プロジェクト名の横の「編集」から開くダイアログの中身）。
 * 左の一覧で項目を切り替える: 基本情報・AI・新しいチャットの既定・書き込みできるフォルダ・削除
 */
export function ProjectSettings({ project }: { project: Project }) {
  const [section, setSection] = useState<SectionKey>("basic");
  const settings = useAsync(api.settings);
  return (
    <div className="project-settings">
      <nav className="project-settings-nav" aria-label="設定の項目">
        {SECTIONS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            className={`project-settings-tab ${section === key ? "active" : ""} ${key === "danger" ? "danger" : ""}`}
            aria-current={section === key}
            onClick={() => setSection(key)}
          >
            <Icon size={15} aria-hidden />
            {label}
          </button>
        ))}
      </nav>
      <div className="project-settings-content">
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
      </div>
    </div>
  );
}
