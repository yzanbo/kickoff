import type { Project } from "../../../core/types";
import { PROJECT_SETTINGS_SECTIONS, ProjectSettings, type ProjectSettingsSection } from "./projectSettings/ProjectSettings";
import { TabbedDialog } from "./TabbedDialog";

/** プロジェクト名の横の「編集」・サイドバーの右クリックから開く、プロジェクトの設定（画面は移らない。initial で最初に開く項目） */
export function ProjectEditDialog({ project, initial, onClose }: { project: Project; initial?: ProjectSettingsSection; onClose: () => void }) {
  return (
    <TabbedDialog title="プロジェクトを編集" sections={PROJECT_SETTINGS_SECTIONS} initial={initial} onClose={onClose}>
      {(section) => <ProjectSettings project={project} section={section} />}
    </TabbedDialog>
  );
}
