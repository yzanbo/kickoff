// chatList が拡張点に出すもの（app/renderer/registry.ts が入れる）: プロジェクトの画面の見出しの状態ごとのチャット
import { projectHeaderStats } from "@/features/projects/ui";
import { allStateChatsItem, stateStatsItem } from "./projectHeaderStats";

export const contributes = [projectHeaderStats.item(stateStatsItem), projectHeaderStats.item(allStateChatsItem)];
