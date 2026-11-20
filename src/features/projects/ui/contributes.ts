// projects が拡張点に出すもの（app/renderer/registry.ts が入れる）
import { openTargets } from "@/foundation/ui/navigation/open";
import { projectViewTarget } from "./openTargets";

export const contributes = [openTargets.item(projectViewTarget)];
