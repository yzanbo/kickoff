// docker が拡張点に出すもの（app/renderer/registry.ts が入れる）: プロジェクトの画面の Docker
import { projectViews } from "@/features/projects/ui";
import { dockerView } from "./projectViews";

export const contributes = [projectViews.item(dockerView)];
