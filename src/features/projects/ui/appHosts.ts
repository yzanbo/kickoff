// projects がアプリの根に置く物: 新しいプロジェクトのダイアログと、プロジェクトがないのに新しいチャットを始めようとしたときの案内
import type { AppHost } from "@/foundation/ui/shell/points";
import { NewProjectAppDialog } from "./new/NewProjectAppDialog";
import { NoProjectsGuide } from "./NoProjectsGuide";

export const projectsHosts: AppHost[] = [
  { id: "newProject", windows: "main", order: 70, dialog: { id: "newProject", Dialog: NewProjectAppDialog } },
  { id: "noProjectsGuide", windows: "main", order: 80, dialog: { id: "noProjectsGuide", Dialog: NoProjectsGuide } },
];
