// projects が拡張点に出すもの（app/renderer/registry.ts が入れる）
import { openTargets } from "@/foundation/ui/navigation/open";
import { projectViewTarget } from "./openTargets";
import { projectViews } from "./projectViews";
import { trashView } from "./trashView";

export const contributes = [openTargets.item(projectViewTarget), projectViews.item(trashView)];
