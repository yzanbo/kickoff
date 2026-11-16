import { useEffect, useRef, useState } from "react";
import { errorMessage } from "@shared/errors";
import type { FeedItem } from "@shared/types";
import { api } from "@/api";
import { subscribeServerOpen, useServerEvent } from "@/api/events";
import { feedItemOf, upsertFeedItems } from "./feed";

const NO_ITEMS: readonly FeedItem[] = Object.freeze([]);
/** 読む件数（チャットの数。絞り込みは画面で、出しているチャットに合うものだけ） */
const FEED_LIMIT = 300;

/**
 * フィード（チャットごとのメインエージェントの最新の返答 1 件）。active の間だけ読み、届いた返答（SSE の chat_event）でその場で入れ替える。
 * サーバーとつなぎ直したら（その間の知らせは届かないので）読み直す。
 * 届いた返答は 1 フレームの分をまとめて 1 回で当てる（並列のサブエージェントが動いている間などに、記録 1 件ごとに描き直さない。メモの仕様書「0023_表示を軽くする」の案 31）
 */
export function useFeed(active: boolean) {
  const [items, setItems] = useState<readonly FeedItem[]>(NO_ITEMS);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string>();
  // まだ当てていない返答と、当てる予約（rAF）
  const pending = useRef<FeedItem[]>([]);
  const frame = useRef<number | null>(null);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    const load = () =>
      api
        .feed(FEED_LIMIT)
        .then((list) => alive && (setItems(list), setError(undefined)))
        .catch((e: unknown) => alive && setError(errorMessage(e)))
        .finally(() => alive && setLoaded(true));
    void load();
    const off = subscribeServerOpen(() => void load());
    return () => {
      alive = false;
      off();
      // 読まなくなったら、ためた分は捨てる（また読むときは一覧ごと読み直す）
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      pending.current = [];
    };
  }, [active]);
  useServerEvent((e) => {
    if (!active || e.type !== "chat_event") return;
    const item = feedItemOf(e.event);
    if (!item) return;
    pending.current.push(item);
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      const added = pending.current;
      pending.current = [];
      frame.current = null;
      setItems((list) => upsertFeedItems(list, added));
    });
  });
  return { items, loaded, error };
}
