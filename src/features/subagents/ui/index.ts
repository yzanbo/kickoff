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
