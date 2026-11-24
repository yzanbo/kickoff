// サブエージェントの機能のコアの入口（ほかの機能はここだけを読む）
import type { CoreFeature } from "@/foundation/core/feature";
import type { ChatApi } from "@/features/chat/core/index";
import { subagentReportParts } from "./reports";

/** サブエージェント: 親に届かなかった報告を、次に送る・伝える指示に添える */
export function createSubagents(deps: { chat: Pick<ChatApi, "store" | "addTurnContributor"> }): CoreFeature<null> {
  deps.chat.addTurnContributor(subagentReportParts(deps.chat.store));
  return { name: "subagents", api: null };
}
export { sessionOfSubagent, subagentLogFromEvents, subagentTranscript, subagentTranscriptFileName } from "./subagentTranscript";
