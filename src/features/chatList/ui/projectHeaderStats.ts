// chatList がプロジェクトの画面の見出し（projectHeaderStats）に出すもの: そのプロジェクトの状態ごとのチャット数・すべてのプロジェクトの状態ごとのチャット
import type { ProjectHeaderStat } from "@/features/projects/ui";
import { ProjectStateStats } from "./StateStats";
import { AllStateChats } from "./activeChats/AllStateChats";

export const stateStatsItem: ProjectHeaderStat = { id: "stateStats", order: 10, Component: ProjectStateStats };
/** 左の数と同じ一覧を「すべてのプロジェクト」から開く（状態ごとの数が 0 でも出す。右上にすべてのプロジェクトの要対応の数） */
export const allStateChatsItem: ProjectHeaderStat = { id: "allStateChats", order: 20, Component: AllStateChats };
