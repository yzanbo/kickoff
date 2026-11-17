import type { ForegroundChat } from "@/features/chat/provider/foregroundChat";

export type SelectableUsage = "claude" | "codex";
export interface TemporaryUsage {
  provider: SelectableUsage;
  foreground: ForegroundChat;
}

/** 選んだ時点のチャット・AI が変わったら、自動追従に戻す。 */
export function activeTemporaryUsage(choice: TemporaryUsage | null, foreground: ForegroundChat): SelectableUsage | null {
  return choice?.foreground === foreground ? choice.provider : null;
}
