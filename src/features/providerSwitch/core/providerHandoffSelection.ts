// AI を替えたときに渡す会話の範囲。元の文を切り詰めず、本文と参照先を作る処理から分けておく。
import type { ChatEvent, ChatEventOf } from "@shared/chat/chatEvent";

const HANDOFF_MAX_TURNS = 10;
export const HANDOFF_MAX_CHARS = 20_000;

type Message = ChatEventOf<"user"> | ChatEventOf<"text">;
type HandoffEntry =
  | { kind: "message"; event: Message }
  | { kind: "long_message"; event: Message };

export interface HandoffSelection {
  entries: HandoffEntry[];
  /** 上限より前に渡していない会話がある（長文は entries 内の参照対象として扱う） */
  earlierOmitted: boolean;
  /** 直近として選んだ発言の本文の文字数。長文の参照と注釈は含めない */
  textChars: number;
}

/**
 * user とメイン AI の返答だけを選ぶ。新しい発言から数え、上限を超える通常の発言は途中で切らず、
 * その発言より古い会話を読み直し対象に残す。1 発言だけで上限を超えるものは全文を別に渡すため印を残す。
 * afterEventId は同じ AI の前回のセッションより後だけを渡す場合の境界（その記録自体は含めない）。
 * 実際の長文ファイルの作成・添付の解決・文字数に含めない案内文は呼び出し側の責務。
 */
export function selectProviderHandoff(events: readonly ChatEvent[], afterEventId = 0): HandoffSelection {
  const turns: Message[][] = [];
  for (const event of events) {
    if (event.id <= afterEventId) continue;
    if (event.type === "user") {
      turns.push([event]);
    } else if (event.type === "text" && !event.data.parent && event.data.text.trim()) {
      turns.at(-1)?.push(event);
    }
  }
  const eligible = turns.slice(-HANDOFF_MAX_TURNS);
  const messages = eligible.flat();
  const selected: HandoffEntry[] = [];
  let chars = 0;
  let omitted = turns.length > eligible.length;
  for (let i = messages.length - 1; i >= 0; i--) {
    const event = messages[i];
    const length = event.data.text.length;
    if (length > HANDOFF_MAX_CHARS) {
      selected.push({ kind: "long_message", event });
      continue;
    }
    if (chars + length > HANDOFF_MAX_CHARS) {
      omitted = true;
      break;
    }
    chars += length;
    selected.push({ kind: "message", event });
  }
  return { entries: selected.reverse(), earlierOmitted: omitted, textChars: chars };
}
