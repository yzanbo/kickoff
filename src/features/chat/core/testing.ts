// チャットのテストの補助: 組み立てたコア（createTestCore）に HTTP 越しに送って待つ・作業中の様子と記録を読む。
// 実行の受付（runner）・店の中を読まない（ほかの機能のテストが、チャットの作りに寄りかからないように）。テストからだけ使う
import { isBusyPhase, type ChatLive } from "@shared/chat/chatLive";
import type { ChatEvent } from "@shared/chat/chatEvent";
import type { ChatDetail } from "@shared/chat/detail";
import type { Chat } from "@shared/chat/types";
import { maskVolatile } from "@/foundation/core/testing/record";
import { until } from "@/foundation/core/testing/until";

/** 補助が使うテストのコアの口（createTestCore の返す物が満たす） */
interface ChatTestCore {
  call(method: string, url: string, body?: unknown): Promise<{ status: number; body: unknown }>;
}

/** チャットの詳細（GET /api/chats/:id） */
async function detailOf(core: ChatTestCore, chatId: number): Promise<ChatDetail> {
  const res = await core.call("GET", `/api/chats/${chatId}`);
  if (res.status !== 200) throw new Error(`チャット ${chatId} の詳細を読めません（${res.status}）`);
  return res.body as ChatDetail;
}

/** チャットの行（chats） */
export async function chatOf(core: ChatTestCore, chatId: number): Promise<Chat> {
  return (await detailOf(core, chatId)).chat;
}

/** 作業中の様子（詳細の live。SSE の chat_live と同じ形） */
export async function liveOf(core: ChatTestCore, chatId: number): Promise<ChatLive> {
  return (await detailOf(core, chatId)).live;
}

/** 作業中か（段階が idle でない。送る準備・作業の終わりにすることも） */
export async function isBusy(core: ChatTestCore, chatId: number): Promise<boolean> {
  return isBusyPhase((await liveOf(core, chatId)).phase);
}

/** 作業が終わる（段階が idle に戻る）まで待つ */
export async function untilIdle(core: ChatTestCore, chatId: number): Promise<void> {
  await until(async () => !(await isBusy(core, chatId)));
}

/** チャットの記録（types を渡せば、その種類だけ） */
export async function eventsOf(core: ChatTestCore, chatId: number, opts: { types?: readonly ChatEvent["type"][] } = {}): Promise<ChatEvent[]> {
  const { events } = await detailOf(core, chatId);
  return opts.types ? events.filter((e) => opts.types!.includes(e.type)) : events;
}

/** 記録のお知らせ（notice）の文 */
export async function noticesOf(core: ChatTestCore, chatId: number): Promise<string[]> {
  return (await eventsOf(core, chatId)).flatMap((e) => (e.type === "notice" ? [e.data.message] : []));
}

/**
 * チャットを作って送り、最後まで終わる（completed で idle に戻る）まで待って ID を返す。
 * parentChatId を渡すと、その子チャット（親の会話は引き継がない）。body は作るときの本文に足す（new_worktree_branch など）
 */
export async function sendAndWait(core: ChatTestCore, opts: { projectId: number; text: string; parentChatId?: number; body?: Record<string, unknown> }): Promise<number> {
  const url = opts.parentChatId === undefined ? `/api/projects/${opts.projectId}/chats` : `/api/chats/${opts.parentChatId}/children`;
  const res = await core.call("POST", url, { text: opts.text, ...(opts.parentChatId === undefined ? {} : { inherit: false }), ...opts.body });
  if (res.status !== 201 && res.status !== 200) throw new Error(`チャットを作れません（${res.status}）`);
  const id = (res.body as Chat).id;
  await until(async () => {
    const detail = await detailOf(core, id);
    return detail.chat.status === "completed" && !isBusyPhase(detail.live.phase);
  });
  return id;
}

/** 文の中のチャット・記録の ID（「ID: 3」「チャット 3」「記録 3」の形）を <ID> に替える（作る順が変わっても記録を変えない） */
function maskIds(text: string, ids: readonly number[]): string {
  const known = new Set(ids.map(String));
  return text.replace(/(ID: |チャット |記録 )(\d+)/g, (whole, head: string, id: string) => (known.has(id) ? `${head}<ID>` : whole));
}

/** AI への指示の文の記録（prompts.snapshot.test.ts）: 見出しごとの文（ないものは「（なし）」）。一時フォルダ・時刻などと ids のチャット・記録の ID を伏せる */
export function promptRecord(parts: Record<string, string | null | undefined>, ids: readonly number[]): string {
  const text = Object.entries(parts)
    .map(([name, value]) => `=== ${name} ===\n${value ?? "（なし）"}\n`)
    .join("\n");
  return maskIds(maskVolatile(text), ids);
}
