import { useAppSettings } from "@/features/settings/ui";
import { addProject } from "@/features/projects/ui/stores/projects";
import { NewProjectDialog } from "./NewProjectDialog";
import { runAfterNewProject } from "./afterNewProject";
import type { NewProjectRequest } from "./openNewProject";

/** アプリのダイアログの新しいプロジェクト（作ったら一覧に入れ、頼んだときの「作ったあとの処理」を行う） */
export function NewProjectAppDialog({ detail, onClose }: { detail: unknown; onClose(): void }) {
  const request = detail as NewProjectRequest;
  const projectsDir = useAppSettings().data?.projects_dir;
  return (
    <NewProjectDialog
      defaultParentDir={projectsDir ?? "~/Documents"}
      initialName={request.name}
      initialMode={request.mode}
      onClose={onClose}
      onCreated={(project) => {
        onClose();
        addProject(project);
        runAfterNewProject(request.after, project);
      }}
    />
  );
}
