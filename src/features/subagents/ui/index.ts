// subagents の画面の口（ほかの機能から読むもの）
import { storage } from "./storage";

/** ほかの機能も読む保存の設定（宣言は ./storage.ts） */
export const subagentsSettings = { archived: storage.settings.archived } as const;

export { chatSubagents, useChatSubagentsView } from "./selectors";
export { childrenOf, pathOf, type SubagentTree } from "./model/subagentTree";
export { agentHueStyle } from "./model/agentHues";
export { SubagentCard } from "./SubagentCard";
export { SubagentEndNote } from "./SubagentEndNote";
export { subagentEvents } from "./model/subagentEvents";
export { scopeOf } from "./model/subagentTree";
export { SubagentActions } from "./SubagentActions";
export { SubagentTellComposer } from "./SubagentTell";
export { SubagentStatusText } from "./SubagentStatusText";
export { NowLine, SubagentChildren, SubagentKind, SubagentLinkActions, SubagentTime, Summary } from "./SubagentHead";
export { SubagentPrompt, SubagentReport, SubagentSteps } from "./subagentBody";
export { useSubagentScope } from "./useSubagentScope";
export { SubagentsContext, type SubagentsView } from "./subagentsContext";
export { ActivityNote, SubagentChip } from "./SubagentChip";
export { subagentStatusLabel } from "./model/subagentList";
export { flattenTree, subagentTree } from "./model/subagentTree";
export { useSubagentsView } from "./subagentsContext";
