// 長く続けるチャットの会話記録の乗り換え（メモの仕様書「ファイル削除」の Q18。2026-11-14 に利用者と決めた）。
// Claude Code は圧縮しても古いやり取りを消さず、同じファイルに書き足し続ける（1.7GB のものがあった）。AI が読むのは最後の要約から後ろだけなので、
// 圧縮した作業が終わったら、直近 3 区切りだけを写した新しいセッションに乗り換え、古い記録は Kickoff のゴミ箱（3 日）へ入れる。
// 画面に出る会話（DB の記録）はすべて残る。残した区切りより前の発言へは、巻き戻し・「ファイルを戻す」ができなくなる
import { UNTITLED_CHAT_TITLE } from "@shared/types";
import type { Store } from "../db/store.js";
import type { AgentProvider } from "../providers/types.js";

/** 古い記録をゴミ箱へ入れる口（ほかの Kickoff が使っていれば入れない。index.ts が作る） */
export type SessionTrash = (sessionId: string, file: string, ctx: { projectId: number; label: string }) => Promise<void>;

/**
 * この作業（since より後の記録）で圧縮していたら、直近の区切りだけの新しいセッションに乗り換える。乗り換えたら新しいセッションの ID を返す
 * （圧縮していない・切るものがない・プロバイダーが対応していなければ null）。古い記録は、ほかのチャットも使っていなければゴミ箱へ
 */
export async function switchAfterCompact(
  deps: { store: Store; provider: AgentProvider; trash?: SessionTrash },
  chatId: number,
  cwd: string,
  since: number,
): Promise<string | null> {
  const { store, provider } = deps;
  if (!provider.trimSession || !store.events.list(chatId).some((e) => e.id > since && e.type === "compact")) return null;
  const chat = store.chats.get(chatId);
  const old = chat?.session_id;
  if (!chat || !old) return null;
  const trimmed = await provider.trimSession(old, cwd);
  if (!trimmed) return null;
  store.events.remapSession(chatId, old, trimmed.sessionId);
  store.chats.update(chatId, { session_id: trimmed.sessionId });
  // 分岐したチャットなど、ほかのチャットがまだ元の記録を指していれば残す
  if (!store.events.sessionInUse(old)) await deps.trash?.(old, trimmed.previousFile, { projectId: chat.project_id, label: `会話記録（「${chat.title || UNTITLED_CHAT_TITLE}」の圧縮より前）` });
  return trimmed.sessionId;
}
