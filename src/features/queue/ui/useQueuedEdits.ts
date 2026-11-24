import { useEffect, useEffectEvent, useLayoutEffect, useState, type RefObject } from "react";
import type { Attachment, QueuedMessage } from "@shared/chat/types";
import { isQueueAction } from "@shared/chat/queueActions";
import { chatQueueApi, useKeepAliveHold } from "@/features/chat/ui";
import { useEditHold } from "@/features/composer/ui";
import type { QueueController } from "./queueController";

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
export function useQueuedEdits(chatId: number, queue: QueuedMessage[], listRef: RefObject<HTMLElement | null>, c: QueueController) {
  const [edits, setEdits] = useState<Record<string, QueuedDraft>>({});
  // いちばん最後に開いた欄（見えるところまで動かす）
  const [last, setLast] = useState<string>();
  const ids = Object.keys(edits);

  // 列から消えた指示の欄を閉じる
  // （見直すのは列が変わったときだけ。開いている欄はそのときの一覧を読む）
  const closeGone = useEffectEvent(() => {
    if (ids.some((id) => !queue.some((m) => m.id === id))) setEdits((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => queue.some((m) => m.id === id))));
  });
  useEffect(() => {
    closeGone();
  }, [queue]);

  // 書き直している指示をコアに知らせ続ける（書き直している間は、タブを裏に回しても会話の欄を止めない。止めると、知らせ直しが切れて書き直しの途中で送られる）
  useEditHold(chatId, ids, tellEditing);
  const hold = useKeepAliveHold("queueEdit");
  const holding = ids.length > 0;
  useEffect(() => hold(holding), [hold, holding]);

  const [editHeight, setEditHeight] = useState(0);
  // 開いている欄と、その文が変わったら測り直す
  const editKey = JSON.stringify(ids.map((id) => [id, edits[id].text]));
  useLayoutEffect(() => {
    const rows = [...(listRef.current?.querySelectorAll<HTMLElement>(".queued-row.editing") ?? [])];
    const total = rows.reduce((sum, row) => sum + row.offsetHeight + 2, 0);
    setEditHeight(rows.length ? Math.min(total + 8, window.innerHeight * 0.6) : 0);
    listRef.current?.querySelector<HTMLElement>(`.queued-row.editing[data-id="${last}"]`)?.scrollIntoView({ block: "nearest" });
  }, [editKey, last, listRef]);

  const close = (id: string) =>
    setEdits((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  return {
    edits,
    editHeight,
    /** 書き直す欄を開く（もう開いているものは、書いている途中の文のまま。挟む行（圧縮・消去）は書き直せないので除く） */
    start: (messages: QueuedMessage[]) => {
      const editable = messages.filter((m) => !isQueueAction(m));
      if (editable.length === 0) return;
      setEdits((prev) => ({ ...prev, ...Object.fromEntries(editable.filter((m) => !prev[m.id]).map((m) => [m.id, { text: m.text, attachments: m.attachments }])) }));
      setLast(editable.at(-1)?.id);
    },
    update: (id: string, patch: Partial<QueuedDraft>) => setEdits((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], ...patch } } : prev)),
    cancel: close,
    /** すべての欄を閉じ、書いている途中の文も捨てる（一覧をたたんだとき。見えないところで書き直し中のまま送るのを止め続けないため） */
    discardAll: () => setEdits({}),
    /**
     * 保存する（send なら続けていま送る。行の「すぐ送る」と同じで、作業中なら止めずに伝える）。保存した欄だけを閉じる。
     * 保存できて送れなかったときも欄は閉じ、失敗だけ知らせる（文はもう保存されている）
     */
    save: (id: string, attachments: Attachment[], send: boolean) =>
      void c.run({ op: "edit", id, text: edits[id]?.text ?? "", attachments }).then((ok) => {
        if (!ok) return;
        close(id);
        if (send) void c.send({ mode: "now", ids: [id] });
      }),
  };
}

/** 書き直している送信待ちの指示を知らせる */
const tellEditing = (chatId: number, ids: string[]) => chatQueueApi("PUT /api/chats/:chatId/queue/editing", { params: { chatId }, body: { ids } });
