import { useEffect, useState } from "react";
import { errorMessage } from "@shared/errors";
import type { FeedItem } from "@shared/types";
import { api } from "@/api";
import { subscribeServerOpen, useServerEvent } from "@/api/events";
import { feedItemOf, upsertFeedItem } from "./feed";

const NO_ITEMS: readonly FeedItem[] = Object.freeze([]);
/** 読む件数（チャットの数。絞り込みは画面で、出しているチャットに合うものだけ） */
const FEED_LIMIT = 300;

/**
 * フィード（チャットごとのメインエージェントの最新の返答 1 件）。active の間だけ読み、届いた返答（SSE の chat_event）でその場で入れ替える。
 * サーバーとつなぎ直したら（その間の知らせは届かないので）読み直す
 */
export function useFeed(active: boolean) {
  const [items, setItems] = useState<readonly FeedItem[]>(NO_ITEMS);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string>();
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
    };
  }, [active]);
  useServerEvent((e) => {
    if (!active || e.type !== "chat_event") return;
    const item = feedItemOf(e.event);
    if (item) setItems((list) => upsertFeedItem(list, item));
  });
  return { items, loaded, error };
}
