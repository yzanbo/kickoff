// groups が拡張点に出すもの（app/renderer/registry.ts が入れる）: プロジェクトの画面が届くのを待つグループの一覧
import { projectGroups } from "@/features/projects/ui";
import { groupsForProjects } from "./projectsPort";

export const contributes = [projectGroups.item(groupsForProjects)];
