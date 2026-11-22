// プロジェクトの画面の表（projectViews）のゴミ箱の中身
import { TrashTab } from "@/features/trash/ui";
import type { ProjectViewContext } from "./projectViews";

export const TrashViewPage = ({ project }: ProjectViewContext) => <TrashTab key={project.id} projectId={project.id} />;
