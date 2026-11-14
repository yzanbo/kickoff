import { useEffect, useRef, useState } from "react";
import type { BusEvent } from "@shared/types";
import { api } from "@/api";
import { errorMessage } from "@shared/errors";
import { subscribeServerOpen, useServerEvent } from "@/api/events";
import { useProjects } from "@/stores/projects";
import { concernsDetail, detailFromIncrement, detailFromSnapshot, EMPTY_DETAIL, reduceChatDetail } from "./chatDetail";

/**
 * チャットの中身（チャット・プロジェクト・イベント・確認・作業中の様子・書いている途中の返答）を取り、サーバーのイベントで追いかける。
 * 作業中の様子（送信待ち・裏の作業・再試行・再接続待ち・圧縮中・停止中）はコアが持つ形（ChatLive）のまま受け、SSE の chat_live で丸ごと置き換える。
 * SSE がつなぎ直されたら取り直す（切れていた間の知らせは届かないため。記録は持っている最後のものより新しい分だけ読み、巻き戻しで消えていたらすべて読み直す）。読み込みの最中に届いた知らせは、届いた中身にもう一度当てる。
 * チャットを切り替えると読み直す（chat が undefined の間は読み込み中。error は読み込みの失敗）。
 * 別のプロジェクトへ移しても読み直さない（中身はそのまま。プロジェクトだけが変わる）
 */
export function useChatDetail(chatId: number) {
  const [detail, setDetail] = useState(EMPTY_DETAIL);
  // 取り直すときに、持っている最後の記録を読む（描いたときの中身）
  const detailRef = useRef(detail);
  detailRef.current = detail;
  // チャットのプロジェクト（プロジェクトの店から。名前・参照資料などを変えたら、開いている間も直る）。
  // チャット自身のプロジェクトで引く（別のプロジェクトへ移したら、タブが知るのを待たずに移した先のものになる）
  const { projectsById } = useProjects();
  const project = detail.chat ? projectsById.get(detail.chat.project_id) : undefined;
  // 書いている途中の返答（確定すると text イベントとして届くので、そこで消す）
  const [streaming, setStreaming] = useState("");
  const [error, setError] = useState<string>();
  // いまの読み込みの番号（チャットを切り替えた・取り直したら進む。番号の違う応答は捨てる）と、その最中に届いた知らせ（読み込み中でなければ null）
  const request = useRef(0);
  const replay = useRef<BusEvent[] | null>(null);

  // 書いている途中の返答は、細切れ（トークンごと）に届く。届くたびに描き直すと、長いチャットでは流れの描き直しが追いつかず
  // 入力が重くなるので、1 フレームの間に届いた分をまとめて足す
  const pendingDelta = useRef("");
  const deltaFrame = useRef<number | null>(null);
  const dropPendingDelta = () => {
    if (deltaFrame.current !== null) cancelAnimationFrame(deltaFrame.current);
    deltaFrame.current = null;
    pendingDelta.current = "";
  };
  /** 書いている途中の返答を消す（確定した・巻き戻した・作業が終わった） */
  const clearStreaming = () => {
    dropPendingDelta();
    setStreaming("");
  };

  /**
   * 読み込む（fresh: チャットを開いた・切り替えた。前の中身を捨てて読み込み中にする / そうでなければ前の中身を出したまま取り直す。
   * all: 取り直しでも記録をすべて読む）
   */
  const load = (fresh: boolean, all = false) => {
    const id = ++request.current;
    replay.current = [];
    if (fresh) {
      setDetail(EMPTY_DETAIL);
      clearStreaming();
      setError(undefined);
    }
    // 取り直し（つなぎ直したとき）は、持っている最後の記録より新しい分だけ読む
    const last = fresh || all || detailRef.current.chat?.id !== chatId ? undefined : detailRef.current.events.at(-1)?.id;
    api
      .chatDetail(chatId, last === undefined ? {} : { after: last })
      .then((d) => {
        if (request.current !== id) return;
        // 持っていた最後の記録が巻き戻しで消えていたら、すべて読み直す
        if (d.after_missing) return loadRef.current(false, true);
        const missed = replay.current ?? [];
        replay.current = null;
        setDetail((prev) => (last === undefined ? detailFromSnapshot(d, missed, chatId, prev) : detailFromIncrement(d, missed, chatId, prev)));
        setError(undefined);
        if (d.chat.status !== "running") clearStreaming();
      })
      .catch((e: unknown) => {
        if (request.current !== id) return;
        replay.current = null;
        // 取り直しの失敗は、前に届いた中身を出したまま（次につながったときにまた取り直す）
        if (fresh) setError(errorMessage(e));
      });
  };
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    loadRef.current(true);
    return () => {
      // 切り替えを素早く繰り返しても、前のチャットの応答で上書きされないように
      request.current++;
      replay.current = null;
      dropPendingDelta();
    };
  }, [chatId]);
  // つなぎ直したら取り直す（切れていた間に増えた記録・変わった様子は、知らせでは届かない）
  useEffect(() => subscribeServerOpen(() => loadRef.current(false)), []);

  useServerEvent((e) => {
    if (e.type === "chat_delta") {
      if (e.chat_id !== chatId) return;
      pendingDelta.current += e.text;
      deltaFrame.current ??= requestAnimationFrame(() => {
        const text = pendingDelta.current;
        deltaFrame.current = null;
        pendingDelta.current = "";
        setStreaming((prev) => prev + text);
      });
      return;
    }
    if (!concernsDetail(e, chatId)) return;
    // 読み込みの最中なら、届いた中身にもう一度当てる。まだ一度も届いていなければ、届いてから当てる（中身のないチャットを描かない）
    replay.current?.push(e);
    setDetail((prev) => (prev.chat === undefined ? prev : reduceChatDetail(prev, e, chatId)));
    if (e.type === "chat_event" && e.event.type !== "user") clearStreaming();
    else if (e.type === "chat_events_deleted") clearStreaming();
    else if (e.type === "chat" && e.chat.status !== "running") clearStreaming();
  });

  return { chat: detail.chat, project, events: detail.events, approvals: detail.approvals, live: detail.live, streaming, error };
}
