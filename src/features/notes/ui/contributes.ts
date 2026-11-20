// notes が拡張点に出すもの（app/renderer/registry.ts が入れる）
import { openTargets } from "@/foundation/ui/navigation/open";
import { noteTarget } from "./openTargets";

export const contributes = [openTargets.item(noteTarget)];
