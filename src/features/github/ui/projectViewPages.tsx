// github がプロジェクトの画面の表（projectViews）に出す画面の中身
import type { ProjectViewContext } from "@/features/projects/ui";
import { CiTab } from "./ci/CiTab";
import { GitHubTab } from "./GitHubTab";

export const GitHubViewPage = ({ project }: ProjectViewContext) => <GitHubTab key={project.id} projectId={project.id} />;
export const CiViewPage = ({ project }: ProjectViewContext) => <CiTab key={project.id} projectId={project.id} />;
