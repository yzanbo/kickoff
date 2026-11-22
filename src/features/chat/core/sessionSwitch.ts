// 長く続けるチャットの会話記録の乗り換え。
// Claude Code は圧縮しても古いやり取りを消さず、同じファイルに書き足し続ける（1.7GB のものがあった）。AI が読むのは最後の要約から後ろだけなので、
// 圧縮した作業が終わったら、直近 3 区切りだけを写した新しいセッションに乗り換え、古い記録は Kickoff のゴミ箱（3 日）へ入れる。
// 画面に出る会話（DB の記録）はすべて残る。残した区切りより前の発言へは、巻き戻し・「ファイルを戻す」ができなくなる
import { UNTITLED_CHAT_TITLE, type Chat } from "@shared/chat/types";
import type { ChatStoreDeps } from "@/features/chat/core/stores";
import type { AgentProvider } from "@/features/ai/core/providers/types";

/** 古い記録をゴミ箱へ入れる口（ほかの Kickoff が使っていれば入れない。index.ts が作る） */
export type SessionTrash = (sessionId: string, file: string, ctx: { projectId: number; label: string }) => Promise<void>;

/**
 * この作業（since より後の記録）で圧縮していたら、直近の区切りだけの新しいセッションに乗り換える。乗り換えたら新しいセッションの ID を返す
 * （圧縮していない・切るものがない・プロバイダーが対応していなければ null）。古い記録は、ほかのチャットも使っていなければゴミ箱へ
 */
export async function switchAfterCompact(
  deps: { store: Pick<ChatStoreDeps, "chats" | "events" | "settings" | "projects">; provider: AgentProvider; trash?: SessionTrash },
  chatId: number,
  cwd: string,
  since: number,
): Promise<string | null> {
  const { store, provider } = deps;
  const trim = provider.sessions?.trim;
  if (!trim || !store.events.exists(chatId, { after: since, type: "compact" })) return null;
  const chat = store.chats.get(chatId);
  const old = chat?.session_id;
  if (!chat || !old) return null;
  const trimmed = await trim(old, cwd);
  if (!trimmed) return null;
  await replaceSession({ store, trash: deps.trash }, chat, trimmed, "圧縮より前");
  return trimmed.sessionId;
}

/**
 * チャットのセッションを、写して作った新しいセッション（made）に乗り換える（記録のセッションも付け替える。長いチャットの乗り換え・作業場所の移動）。
 * 元の記録は、分岐したチャットなどほかのチャットがまだ指していなければゴミ箱へ（返すのはその待ち。label はゴミ箱の行の「〜の」のあと）
 */
export function replaceSession(deps: { store: Pick<ChatStoreDeps, "chats" | "events" | "settings" | "projects">; trash?: SessionTrash }, chat: Chat, made: { sessionId: string; previousFile: string }, label: string): Promise<void> {
  const { store } = deps;
  const old = chat.session_id;
  if (old) store.events.remapSession(chat.id, old, made.sessionId);
  store.chats.update(chat.id, { session_id: made.sessionId });
  if (!old || store.events.sessionInUse(old)) return Promise.resolve();
  return deps.trash?.(old, made.previousFile, { projectId: chat.project_id, label: `会話記録（「${chat.title || UNTITLED_CHAT_TITLE}」の${label}）` }) ?? Promise.resolve();
}
