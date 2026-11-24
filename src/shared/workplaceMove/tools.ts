// 作業場所を AI が移すツールの、画面とスマホに出す表示名と記録の行の文
import { aiToolViewOf, type AiToolView } from "@shared/foundation/aiToolView";
import { AI_CANCEL_WORKPLACE_MOVE_TOOL, AI_MOVE_WORKPLACE_TOOL, describeMoveWorkplace } from "./aiWorkplace";

/** 作業場所の移動の機能のツールの表示の表 */
export const WORKPLACE_MOVE_TOOL_VIEWS: readonly AiToolView[] = [
  // どこへ移すか（変更を持っていくなら添える。予約の様子は流れのいちばん下の行、移したら区切りの 1 行）
  aiToolViewOf(AI_MOVE_WORKPLACE_TOOL, "作業場所を移す予約", describeMoveWorkplace),
  aiToolViewOf(AI_CANCEL_WORKPLACE_MOVE_TOOL, "作業場所を移す予約を取り消す"),
];
