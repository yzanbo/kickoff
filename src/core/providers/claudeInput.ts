import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";

type Uuid = NonNullable<SDKUserMessage["uuid"]>;

/** 自分の発言（uuid を付けると Claude Code はその ID で記録する。ファイルをその発言の時点に戻すときの目印） */
const userMessage = (text: string, uuid?: string): SDKUserMessage => ({
  type: "user",
  message: { role: "user", content: text },
  parent_tool_use_id: null,
  session_id: "",
  ...(uuid ? { uuid: uuid as Uuid } : {}),
});

/**
 * Claude Code への入力（ストリーミング入力）。最初の指示のあとも開いたままにして、作業中に発言を足せるようにする
 * （足した発言は、いまの手順の切れ目でメインのエージェントが読む）。裏の作業を止める（stopTask）にも、入力が開いている必要がある。
 * close は、まだ渡していない発言があるときは閉じない（足した発言を落とさない）。閉じたあとの push は false
 */
export function createInputChannel(first: string, firstUuid?: string) {
  const pending: SDKUserMessage[] = [userMessage(first, firstUuid)];
  let closed = false;
  let wake: (() => void) | undefined;
  async function* messages(): AsyncGenerator<SDKUserMessage> {
    while (true) {
      const next = pending.shift();
      if (next) {
        yield next;
        continue;
      }
      if (closed) return;
      await new Promise<void>((resolve) => (wake = resolve));
    }
  }
  return {
    messages: messages(),
    /** 発言を足す（閉じていれば false） */
    push(text: string, uuid?: string): boolean {
      if (closed) return false;
      pending.push(userMessage(text, uuid));
      wake?.();
      return true;
    },
    /** 入力を閉じる（まだ渡していない発言があれば、force でない限り閉じない）。閉じたら true */
    close(force = false): boolean {
      if (closed) return true;
      if (pending.length > 0 && !force) return false;
      closed = true;
      wake?.();
      return true;
    },
  };
}
