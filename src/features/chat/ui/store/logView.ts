// チャットの店（chatStore.ts）の口 log の値の作り方（チャットごとに、前の値と範囲・頭が同じなら流れの項目に渡す preface を使い回す）
import { digestOf, loadedOf, prefaceOf, type LogRange } from "./chatLog";
import type { ChatLogView, Entry } from "./chatStoreTypes";

export function createLogView(): (e: Entry) => ChatLogView {
  const prevRange = new WeakMap<Entry, LogRange>();
  return (e) => {
    const { events: tail, range } = e.detail;
    const prev = e.published.log;
    const events = range.focus?.events ?? tail;
    const sameRange = prevRange.get(e) === range;
    prevRange.set(e, range);
    return {
      events,
      tail,
      digest: digestOf(range, tail),
      loaded: loadedOf(range, tail),
      preface: sameRange && prev.events[0]?.id === events[0]?.id ? prev.preface : prefaceOf(range, tail),
      tailStart: range.tailStart,
      hasEarlier: range.focus ? range.focus.hasEarlier : range.hasEarlier,
      focused: range.focus !== null,
      headPartial: range.focus === null && range.headPartial,
      paging: e.paging !== null,
      streamGen: e.stream.gen,
    };
  };
}
