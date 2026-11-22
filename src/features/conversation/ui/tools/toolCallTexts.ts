import type { ToolCallText } from "@shared/chat/toolText";
import type { ToolCall } from "@/features/chat/ui";

/** まとまりの呼び出しを、要約（toolText().summarizeTools）に渡す形にする */
export const toolCallTexts = (tools: readonly ToolCall[]): ToolCallText[] => tools.map((t) => ({ name: t.use.data.name, input: t.use.data.input, id: t.use.id }));
