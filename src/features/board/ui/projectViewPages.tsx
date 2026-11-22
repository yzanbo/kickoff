// board がプロジェクトの画面の表（projectViews）に出す画面の中身
import type { ProjectViewContext } from "@/features/projects/ui";
import { KanbanBoard } from "./KanbanBoard";

export const BoardViewPage = ({ project, focus }: ProjectViewContext) => <KanbanBoard projectId={project.id} focus={focus} />;
