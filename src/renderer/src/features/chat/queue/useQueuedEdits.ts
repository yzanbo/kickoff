import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { EDIT_HOLD_TTL_MS } from "@shared/chat/queueEditHolds";
import type { Attachment, QueuedMessage } from "@shared/types";
import { api } from "@/api";

/** 書き直している途中の 1 件（文と添付） */
interface QueuedDraft {
  text: string;
  attachments: Attachment[];
}

/**
 * 送信待ちの書き直す欄の状態と操作。いくつでも同時に開ける（指示ごとに書いている途中の文を持ち、保存・やめるはその 1 件だけを閉じる）。
 * 送った・消したなどで列から消えた指示の欄は閉じる。
 * 開いている欄の指示はコアに知らせ（持ち時間より短い間隔で知らせ直す）、次に送る指示を書き直している間は自動で送らせない
 * （書き直しが終わる = 保存・やめる・一覧をたたむ・画面を閉じると外れて送る。queueEditHolds.ts）。
 * editHeight: 書き直している行の高さの合計（文を中でスクロールさせず全部見せるため、一覧の高さの上限をこれより低くしない。画面の 6 割まで）
 */
export function useQueuedEdits(chatId: number, queue: QueuedMessage[], listRef: RefObject<HTMLElement | null>, failed: (e: unknown) => void) {
  const [edits, setEdits] = useState<Record<string, QueuedDraft>>({});
  // いちばん最後に開いた欄（見えるところまで動かす）
  const [last, setLast] = useState<string>();
  const ids = Object.keys(edits);

  // 列から消えた指示の欄を閉じる
  useEffect(() => {
    if (ids.some((id) => !queue.some((m) => m.id === id))) setEdits((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => queue.some((m) => m.id === id))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue]);

  // 書き直している指示をコアに知らせる（開いている間は知らせ直す。一度も開いていなければ知らせない）
  const editingKey = [...ids].sort().join(",");
  const told = useRef(false);
  useEffect(() => {
    const list = editingKey ? editingKey.split(",") : [];
    if (list.length === 0 && !told.current) return;
    told.current = list.length > 0;
    const tell = () => void api.setQueueEditing(chatId, list).catch(() => undefined);
    tell();
    if (list.length === 0) return;
    const timer = setInterval(tell, EDIT_HOLD_TTL_MS / 4);
    return () => clearInterval(timer);
  }, [chatId, editingKey]);
  // 欄ごと消えた（チャットを閉じた・切り替えた）: 書き直しは終わったとして外す（欄の中身も残らない）
  useEffect(
    () => () => {
      if (told.current) void api.setQueueEditing(chatId, []).catch(() => undefined);
      told.current = false;
    },
    [chatId],
  );

  const [editHeight, setEditHeight] = useState(0);
  useLayoutEffect(() => {
    const rows = [...(listRef.current?.querySelectorAll<HTMLElement>(".queued-row.editing") ?? [])];
    const total = rows.reduce((sum, row) => sum + row.offsetHeight + 2, 0);
    setEditHeight(rows.length ? Math.min(total + 8, window.innerHeight * 0.6) : 0);
    listRef.current?.querySelector<HTMLElement>(`.queued-row.editing[data-id="${last}"]`)?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(","), last, ...ids.map((id) => edits[id].text)]);

  const close = (id: string) =>
    setEdits((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  return {
    edits,
    editHeight,
    /** 書き直す欄を開く（もう開いているものは、書いている途中の文のまま） */
    start: (messages: QueuedMessage[]) => {
      setEdits((prev) => ({ ...prev, ...Object.fromEntries(messages.filter((m) => !prev[m.id]).map((m) => [m.id, { text: m.text, attachments: m.attachments }])) }));
      setLast(messages.at(-1)?.id);
    },
    update: (id: string, patch: Partial<QueuedDraft>) => setEdits((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], ...patch } } : prev)),
    cancel: close,
    /** すべての欄を閉じ、書いている途中の文も捨てる（一覧をたたんだとき。見えないところで書き直し中のまま送るのを止め続けないため） */
    discardAll: () => setEdits({}),
    /** 保存する（send なら続けていま送る。行の「すぐ送る」と同じで、作業中なら止めずに伝える）。保存した欄だけを閉じる */
    save: (id: string, attachments: Attachment[], send: boolean) =>
      void api
        .editQueued(chatId, id, edits[id]?.text ?? "", attachments)
        .then(() => (send ? api.sendQueuedNow(chatId, id) : undefined))
        .then(() => close(id), failed),
  };
}
