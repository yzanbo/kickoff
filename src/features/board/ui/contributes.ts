// board が拡張点に出すもの（app/renderer/registry.ts が入れる）: プロジェクトの画面のボード
import { projectViews } from "@/features/projects/ui";
import { boardView } from "./projectViews";

export const contributes = [projectViews.item(boardView)];
