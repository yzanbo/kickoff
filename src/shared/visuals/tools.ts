// 図を AI が描くツールの、画面とスマホに出す表示名と記録の行の文
import { aiToolViewOf, type AiToolView } from "@shared/foundation/aiToolView";
import { AI_SHOW_VISUAL_TOOL, AI_UPDATE_VISUAL_TOOL, AI_VISUAL_GUIDE_TOOL, describeVisual } from "./aiVisual";

/** 図の機能のツールの表示の表 */
export const VISUAL_TOOL_VIEWS: readonly AiToolView[] = [
  aiToolViewOf(AI_VISUAL_GUIDE_TOOL, "図の書き方を読む", (input) => (Array.isArray(input.topics) ? input.topics.filter((t) => typeof t === "string").join("・") : "")),
  // 題名と種類（「構成図（SVG）」）。中身は図として出す
  aiToolViewOf(AI_SHOW_VISUAL_TOOL, "図を描く", describeVisual),
  aiToolViewOf(AI_UPDATE_VISUAL_TOOL, "図を描き直す", describeVisual),
];
