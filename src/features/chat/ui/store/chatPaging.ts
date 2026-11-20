// チャットの店の、記録の読み足し（前を読む・途中の一部分・サブエージェントの中・見ていない間に縮める。
// chatStore.ts が使う。範囲の決まりは純粋関数の chatLog.ts）
import { CHAT_TAIL_TURNS, type ChatEventPage, type ChatEventsQuery } from "@shared/foundation/apiTypes";
import type { ChatDetailState } from "./chatDetail";
import {
  displays,
  focusEarlier,
  focusLater,
  joinSince,
  prependTail,
  shrinkTail,
  turnHeadOf,
  turnsBefore,
  withFocus,
  withScopes,
  type LogRange,
} from "./chatLog";
import type { ChatStoreDeps, Entry } from "./chatStoreTypes";

interface PagingDeps {
  entries: Map<number, Entry>;
  page: ChatStoreDeps["page"];
  /** 口 log の差し替えを予約する */
  mark: (e: Entry) => void;
}

type Applied = { range: LogRange; tail?: ChatDetailState["events"] };

export function createPaging({ entries, page: fetchPage, mark }: PagingDeps) {
  const resolved = Promise.resolve();
  const loadedEntry = (chatId: number) => {
    const e = entries.get(chatId);
    return e?.detail.chat ? e : undefined;
  };

  /**
   * 記録の一部分を読んで当てる（1 つずつ。読んでいる間にすべて読み直したら答えは捨てる）。apply は当てたあとの末尾と範囲を返す。
   * 読めなくても失敗にしない（前の中身のまま。もう一度押せば読み直す）
   */
  const page = (e: Entry, query: ChatEventsQuery, apply: (p: ChatEventPage, d: ChatDetailState) => Applied): Promise<void> => {
    if (e.paging) return e.paging;
    const epoch = e.epoch;
    const run = fetchPage(e.chatId, query)
      .then((p) => {
        if (entries.get(e.chatId) !== e || e.epoch !== epoch) return;
        const next = apply(p, e.detail);
        e.detail = { ...e.detail, range: next.range, events: next.tail ?? e.detail.events };
      })
      .catch(() => undefined)
      .finally(() => {
        e.paging = null;
        mark(e);
      });
    e.paging = run;
    mark(e);
    return run;
  };

  return {
    /** 見ていない間の末尾を縮める（店の retain が時計で呼ぶ） */
    shrink(e: Entry) {
      e.cancelShrink = null;
      if (e.viewers.size > 0 || !e.detail.chat || e.paging) return;
      const ctx = {
        approvalCallIds: e.detail.approvals.flatMap((a) => (a.tool_use_id ? [a.tool_use_id] : [])),
        backgroundCallIds: (e.detail.live.background?.tasks ?? []).flatMap((t) => (t.tool_use_id ? [t.tool_use_id] : [])),
      };
      const next = shrinkTail(e.detail.range, e.detail.events, ctx);
      if (next.tail.length === e.detail.events.length && !e.detail.range.focus && e.detail.range.scopes.length === 0) return;
      e.detail = { ...e.detail, range: next.range, events: next.tail };
      mark(e);
    },

    /** 流れに出している記録の前を読み足す（途中の一部分ならその前、なければ末尾の前を CHAT_TAIL_TURNS ターン） */
    loadEarlier(chatId: number): Promise<void> {
      const e = loadedEntry(chatId);
      if (!e) return resolved;
      const { range } = e.detail;
      if (range.focus) {
        const first = range.focus.events[0]?.id;
        if (!range.focus.hasEarlier || first === undefined) return resolved;
        return page(e, { before: first, turns: CHAT_TAIL_TURNS }, (p, d) => ({ range: focusEarlier(d.range, p) }));
      }
      if (!range.hasEarlier || range.tailStart === 0) return resolved;
      return page(e, { before: range.tailStart, turns: CHAT_TAIL_TURNS }, (p, d) => prependTail(d.range, d.events, p));
    },

    /** 途中の一部分の後ろを読み足す（末尾に届いたら末尾につなぐ） */
    loadLater(chatId: number): Promise<void> {
      const e = loadedEntry(chatId);
      const last = e?.detail.range.focus?.events.at(-1)?.id;
      if (!e || last === undefined) return resolved;
      return page(e, { after: last, turns: CHAT_TAIL_TURNS, until: e.detail.range.tailStart }, (p, d) => focusLater(d.range, d.events, p));
    },

    /**
     * その記録を流れに出せるよう読む（読めたら流れがその記録を含む）。末尾の中なら途中の一部分をやめるだけ、末尾から 2 回分の読み足しの
     * ターン以内なら末尾をそこまで伸ばし、遠ければその前後を途中の一部分として読む（読む間は呼ぶ側が今の位置で待つ）
     */
    openAround(chatId: number, eventId: number): Promise<void> {
      const e = loadedEntry(chatId);
      if (!e) return resolved;
      const { range, events } = e.detail;
      if (displays(range, events, eventId)) return resolved;
      if (eventId >= range.tailStart) {
        e.detail = { ...e.detail, range: { ...range, focus: null } };
        mark(e);
        return resolved;
      }
      if (turnsBefore(range, eventId) <= CHAT_TAIL_TURNS * 2) {
        return page(e, { before: range.tailStart, since: turnHeadOf(range, eventId) }, (p, d) => joinSince(d.range, d.events, p));
      }
      return page(e, { around: eventId, turns: CHAT_TAIL_TURNS, until: range.tailStart }, (p, d) => withFocus(d.range, d.events, p));
    },

    /** 途中の一部分をやめて末尾に戻る（一番下へ戻る） */
    backToTail(chatId: number) {
      const e = loadedEntry(chatId);
      if (!e?.detail.range.focus) return;
      e.detail = { ...e.detail, range: { ...e.detail.range, focus: null } };
      mark(e);
    },

    /** 末尾より前に始まったサブエージェントの中を読む（parents の流れと、ids の記録。読んだ流れは読み直さない） */
    loadScope(chatId: number, parents: readonly string[], ids: readonly number[] = []): Promise<void> {
      const e = loadedEntry(chatId);
      if (!e) return resolved;
      const { range } = e.detail;
      const wanted = parents.filter((p) => !range.scopeKeys.includes(p));
      if (wanted.length === 0 || range.tailStart === 0) return resolved;
      const query: ChatEventsQuery = { parents: wanted.join(","), ...(ids.length > 0 ? { ids: ids.join(",") } : {}), before: range.tailStart };
      return page(e, query, (p, d) => ({ range: withScopes(d.range, wanted, p.events) }));
    },

    /**
     * 頭のターンを途中から読んだ末尾（1 ターンが大きすぎて終わりから上限まで読んだ）の、そのターンの頭までを読んで末尾につなぐ。
     * 読み終えるまで、その作業の終わりの行に作業全体から作るもの（変更カード・返答のコピー・依頼文）を出さない。店が描いたあとの手すきに呼ぶ
     */
    fillHead(chatId: number): Promise<void> {
      const e = loadedEntry(chatId);
      if (!e) return resolved;
      const { range } = e.detail;
      if (range.focus || !range.headPartial || range.tailStart === 0) return resolved;
      return page(e, { before: range.tailStart, since: turnHeadOf(range, range.tailStart) }, (p, d) => joinSince(d.range, d.events, p));
    },

    /** その記録をいま流れに出しているか */
    shows(chatId: number, eventId: number): boolean {
      const e = loadedEntry(chatId);
      return e ? displays(e.detail.range, e.detail.events, eventId) : false;
    },
  };
}
