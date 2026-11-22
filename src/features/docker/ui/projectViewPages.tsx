// docker がプロジェクトの画面の表（projectViews）に出す画面の中身
import type { ProjectViewContext } from "@/features/projects/ui";
import { DockerTab } from "./DockerTab";

export const DockerViewPage = ({ project }: ProjectViewContext) => <DockerTab key={project.id} projectId={project.id} />;
