import type { ChatEvent } from "@shared/types";
import { selectIndexIds, slimIndexEvent, type ChatEventMeta, type IndexContext, type IndexKeep } from "@shared/chat/chatIndex";
import type { Store } from "../db/store.js";

/** 索引を覚えておくチャットの数（最後に読んだ順。記録の多いチャットは軽い形だけで数 MB になるので、少しだけ） */
const INDEX_CACHE_CHATS = 6;

/** 1 つのチャットの覚え */
interface Entry {
  /** 記録の軽い形（古い順）。id < readTo の分をすべて持つ */
  metas: ChatEventMeta[];
  readTo: number;
  /** 索引に入れた記録（軽くしたもの）と残し方 */
  events: Map<number, { keep: IndexKeep; event: ChatEvent }>;
  /** 最後に返した索引（同じ始まりと外の ID なら、そのまま返す） */
  last: { start: number; ctxKey: string; index: ChatEvent[] } | null;
}

/**
 * 末尾より前の記録の索引を、チャットごとに覚えておく（開き直す・先読みしたチャットを開くたびに、
 * 覆う索引の全件（記録を 10 倍にしたチャットで 8 万行・約 100ms）と選んだ行（約 40ms）を読み直さない）。
 * 記録は後ろに足すだけで ID を使い回さないので、末尾の始まりが後ろへ動いたら増えた分の軽い形だけを読み足し、選び直して、まだ持っていない行だけを読む
 * （選ぶ決まりは前後をまたぐ（parent ごとの最後など）ので、選ぶのは毎回すべての軽い形から。選ぶだけなら 10ms ほど）。
 * 巻き戻し・セッションの付け替え・チャットの削除（Store の logRevisions）で、そのチャットの覚えを捨てる
 */
export class ChatIndexCache {
  private readonly entries = new Map<number, Entry>();

  constructor(
    private readonly store: Store,
    private readonly limit = INDEX_CACHE_CHATS,
  ) {
    store.logRevisions.subscribe((chatId) => this.entries.delete(chatId));
  }

  /** id < start の記録の索引（buildIndex と同じ中身） */
  index(chatId: number, start: number, ctx: IndexContext): ChatEvent[] {
    const ctxKey = `${ctx.approvalCallIds.join(",")}|${ctx.backgroundCallIds.join(",")}`;
    const entry = this.touch(chatId);
    if (entry.last && entry.last.start === start && entry.last.ctxKey === ctxKey && start <= entry.readTo) return entry.last.index;
    if (start > entry.readTo) {
      // 読み足すのは、いまある記録の ID の終わりまで（それより後ろの ID には、これから記録が足されうる）
      const to = Math.min(start, this.store.events.maxId() + 1);
      for (const r of this.store.events.metas(chatId, entry.readTo, to)) entry.metas.push(r.meta);
      entry.readTo = Math.max(entry.readTo, to);
    }
    const picked = selectIndexIds(entry.metas, start, ctx);
    const missing = [...picked].filter(([id, keep]) => entry.events.get(id)?.keep !== keep).map(([id]) => id);
    const fresh = new Map<number, { keep: IndexKeep; event: ChatEvent }>();
    for (const e of this.store.events.byIds(chatId, missing)) {
      const keep = picked.get(e.id)!;
      fresh.set(e.id, { keep, event: slimIndexEvent(e, keep) });
    }
    // 選ばれなくなった行は捨てる（覚えを索引の大きさまでにする）
    const events = new Map<number, { keep: IndexKeep; event: ChatEvent }>();
    for (const id of [...picked.keys()].sort((a, b) => a - b)) {
      const held = fresh.get(id) ?? entry.events.get(id);
      if (held) events.set(id, held);
    }
    entry.events = events;
    const index = [...events.values()].map((h) => h.event);
    entry.last = { start, ctxKey, index };
    return index;
  }

  /** そのチャットの覚え（なければ作る）を、最後に使ったものにする。数の上限を超えたら古いものから捨てる */
  private touch(chatId: number): Entry {
    const entry = this.entries.get(chatId) ?? { metas: [], readTo: 0, events: new Map(), last: null };
    this.entries.delete(chatId);
    this.entries.set(chatId, entry);
    for (const oldest of this.entries.keys()) {
      if (this.entries.size <= this.limit) break;
      this.entries.delete(oldest);
    }
    return entry;
  }
}

const caches = new WeakMap<Store, ChatIndexCache>();

/** その DB の索引の覚え（Store ごとに 1 つ。テストで DB を作り直せば覚えも別） */
export function indexCacheOf(store: Store): ChatIndexCache {
  let cache = caches.get(store);
  if (!cache) caches.set(store, (cache = new ChatIndexCache(store)));
  return cache;
}
