import type { Project } from "../../../core/types";
import { PROJECT_SETTINGS_SECTIONS, ProjectSettings } from "./projectSettings/ProjectSettings";
import { TabbedDialog } from "./TabbedDialog";

/** プロジェクト名の横の「編集」から開く、プロジェクトの設定（画面は移らない） */
export function ProjectEditDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  return (
    <TabbedDialog title="プロジェクトを編集" sections={PROJECT_SETTINGS_SECTIONS} onClose={onClose}>
      {(section) => <ProjectSettings project={project} section={section} />}
    </TabbedDialog>
  );
}
