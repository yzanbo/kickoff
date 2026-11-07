import { ChevronRight, ChevronsDownUp, ChevronsUpDown, OctagonPause, SendHorizontal } from "lucide-react";
import { Fragment, useLayoutEffect, useRef, useState } from "react";
import type { ChatLive, QueueState } from "@shared/types";
import { isQueueAction } from "@shared/chat/queueActions";
import { api } from "@/api";
import { QueuedHeadTools } from "./QueuedHeadActions";
import { QueueResumeBanner } from "./QueueResumeBanner";
import { QueuedSelectionActions } from "./QueuedSelectionActions";
import { QueuedEditor } from "./QueuedEditor";
import { QueuedRow } from "./QueuedRow";
import { QueuedStopLine } from "./QueuedStopLine";
import { QueuedPauseNotice } from "./QueuedPauseNotice";
import { useQueueDrag } from "./useQueueDrag";
import { useQueuePrediction } from "./useQueuePrediction";
import { useSendingQueued } from "./useSendingQueued";
import { QueuedSendingRow } from "./QueuedSendingRow";
import { useQueuedEdits } from "./useQueuedEdits";
import { useQueueSelection } from "./useQueueSelection";
import { useAskInNewChat } from "./askInNewChat";
import { useAskInChildChat } from "./askInChildChat";
import { nextQueuedText, queuedHint } from "./queuedHint";
import { queueFailed as failed } from "./queueFailed";
import { useChatPane } from "@/features/chat/pane/chatPaneContext";
import { cx } from "@/lib/cx";
import { useDragSize } from "@/hooks/useDragSize";
import { useSetting } from "@/hooks/useSetting";
import { QUEUE_COLLAPSED, QUEUE_EXPANDED, QUEUE_HEIGHT } from "@/lib/storageKeys";
import { moveStopOnce, removeStopOnce } from "@shared/chat/queueStops";

/** 一覧の高さの上限の初め（5 件ほど）と、つまみで縮められる下限（1 件ほど） */
const MIN_LIST_HEIGHT = 36;

/**
 * 作業中に送った次の指示の待ちの列（チャット欄のすぐ上）。
 * いまの作業が終わったら（止めた・失敗したときも）先頭から順に送る。並べ替え・消す・すぐ送る（作業中なら止めずに、いまのやり取りに伝える）ができる。
 * 見出しに送信待ちの数、行に添付（1 つ目のサムネイルと、ほかの数）を出す。5 件ほどを超えたら一覧の中でスクロールし（上端のつまみのドラッグで高さを変えられ、見出しの「すべて表示」でスクロールさせずにすべて出せる）、狭い欄では ↑↓ とボタンの文字を隠す（右クリックのメニューに同じ操作がある）。
 * ⌘ / Shift ＋クリックで行を選ぶと、選んだものだけをまとめて送る・消す・いちばん上か下へ移せる（見出しと右クリック。Esc でやめる）。
 * 行は左のつまみのドラッグでも並べ替えられる（↑↓ のボタンと同じ。文は選んでコピーできる）。行のダブルクリックで書き直す。
 * 見出しの右の操作は、追加（一時停止・圧縮・コンテキスト消去）｜ 送り方（自動で送る・すべて送る）｜ すべて消す のまとまりに分ける（QueuedHeadTools。狭ければまとまりごと 2 行目へ）。
 * 一時停止の線（指示とは別の行。ドラッグで動かせ、1 件目の上にも置ける）まで自動で送ったら、残りは止めておく。
 * 「会話を圧縮」「コンテキストを消去」の行（見出しの「＋追加」でいちばん下に、行の右クリックの「このあとで…」でその指示のすぐあとに足す）まで来たら、
 * 会話を圧縮する・コンテキストを消して新しい会話にしてから次を送る。
 * 列が空でも、いまの作業が終わったら止める印があれば（質問として送った）、その予定の 1 行（QueuedPauseNotice）を出す。
 * 行の右クリックの「この指示のあとで止める」でも付けられる。
 * 見出しの「自動で送る / 止めています」で、いまの作業が終わったときに先頭を自動で送るか、送らずに止めておくかを切り替える
 * （チャットごと。止めておくと、行の「すぐ送る」で 1 件ずつ送れる。送り終えて列が空になったら、自動で送るに戻る）。
 * 初めは畳み、「送信待ち n 件・止める位置・次: 次に送る指示の初めの行」の 1 行だけにする（ためるほど流れが狭くなるため。見出しを押すと開き、どのチャットでも同じに覚える）。
 * 入力欄のすぐ上に区切り線だけでつなげ、1 枚の枠に見せる（queued.css）
 */
export function QueuedMessages({
  queue,
  busy,
  childChats,
  resume,
  lastUserEventId,
}: {
  /**
   * 送信待ちの様子（作業中の様子の queue）。stops は一時停止の印の位置（0 = 1 件目の上、n = n 件目のあと。いくつでも）、
   * waiting_edit はコアが次の指示の書き直しが終わるのを待っているか（作業は終わり、送信の準備ができている）
   */
  queue: QueueState;
  busy: boolean;
  /** 右クリックの「子チャットで開く / 移す」を出すか（メモのチャット・アーカイブ済みでは子チャットを作れない） */
  childChats: boolean;
  /** 起動したときの送信待ちの確かめを待っている（前回の終了で残った。決めるまでコアは送らない。上に帯を出す） */
  resume: ChatLive["queue_resume"];
  /** 流れに出ている、いちばん新しい自分の発言の記録の ID（なければ 0）。送った指示を、チャット欄に出るまで「送信中」で残すのに使う */
  lastUserEventId: number;
}) {
  const { chatId } = useChatPane();
  const { paused, waiting_edit: waitingEdit } = queue;
  // 並べ替えは、落とした形をサーバーの応答より先に出す（出す並びは先回りのものになることがある）
  const view = useQueuePrediction(queue.messages, queue.stops);
  const { messages, stops } = view;
  // 送った指示は、チャット欄にその発言が出るまで、いちばん上に「送信中」で残す（どこにもない間を作らない）
  const sending = useSendingQueued(chatId, queue.messages, lastUserEventId);
  const [collapsed, setCollapsed] = useSetting(QUEUE_COLLAPSED);
  // 中でスクロールさせずにすべて出すか（どのチャットでも同じに覚える）と、いま中でスクロールするほど溜まっているか
  const [expanded, setExpanded] = useSetting(QUEUE_EXPANDED);
  const listRef = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  /**
   * 一覧の高さの上限（上端のつまみのドラッグで変える。上へ動かすほど高く、いま見えている高さから。上限は画面の高さの 6 割。
   * ダブルクリックで元の高さ）。ドラッグ中は描き直さず、style だけ書き換える。高さを決めたら、すべて表示はやめる（決めた高さで中をスクロールさせる）
   */
  const resize = useDragSize({
    setting: QUEUE_HEIGHT,
    axis: "y",
    edge: "start",
    min: MIN_LIST_HEIGHT,
    max: () => Math.max(MIN_LIST_HEIGHT, Math.round(window.innerHeight * 0.6)),
    write: "maxHeight",
    pane: listRef,
    onChange: () => setExpanded(false),
  });
  const height = resize.size;
  const resizing = resize.resizing;
  // ⌘ / Ctrl ＋クリックで 1 件ずつ、Shift ＋クリックで範囲を選ぶ（選んだものだけ、まとめて送る・消す・移す。Esc でやめる）
  const { selected, selectRow, clearSelection } = useQueueSelection(messages);
  // ドラッグ: 指示の並べ替えと、一時停止の印の移動
  const dnd = useQueueDrag(chatId, messages, stops, failed, view.predict);
  // 右クリックの「新しいチャットで聞く / 移す」（文と添付を新しいチャットのタブに入れて開く。パネルの外では出さない）
  const ask = useAskInNewChat(messages);
  // 右クリックの「子チャットで開く / 移す」（会話を引き継ぐ / 新しく始めるを選んで子チャットを作って送り、設定の開き方で開く）
  const askChild = useAskInChildChat(messages, childChats);
  // 書き直す欄（いくつでも同時に開ける。指示ごとに書いている途中の文を持つ）
  const edit = useQueuedEdits(chatId, messages, listRef, failed);
  const editSelected = () => {
    edit.start(messages.filter((q) => selected.includes(q.id)));
    clearSelection();
  };
  // 一覧の高さが上限を超えたか（超えたときだけ「すべて表示」を出す。すべて出している間は「縮める」を出したまま）
  useLayoutEffect(() => {
    const el = listRef.current;
    setOverflowing(Boolean(el && !expanded && el.scrollHeight > el.clientHeight + 1));
  }, [messages, edit.edits, collapsed, expanded, height]);
  // 空のときは出さない。いまの作業が終わったら止める印だけがあれば（質問として送った）、その予定の 1 行だけ出す
  if (messages.length === 0 && sending.length === 0) return busy && stops.includes(0) ? <QueuedPauseNotice chatId={chatId} /> : null;
  // 新しいチャット・子チャットで聞く指示（選んでいる行なら選んだものすべて）。挟む行（会話の圧縮・コンテキストの消去）は持っていかない（送信待ちに残す）
  const askWith = (run: (ids: string[], remove: boolean) => void, id: string, remove: boolean) => {
    const ids = selected.includes(id) && selected.length > 1 ? selected : [id];
    const asked = ids.filter((x) => {
      const q = messages.find((m) => m.id === x);
      return q && !isQueueAction(q);
    });
    if (asked.length > 0) run(asked, remove);
    clearSelection();
  };
  // 次に止まる位置（いちばん上の印。なければ -1）。行の右クリックの「この指示のあとで止める」は、その行のすぐあとの印を付け外しする
  const stopIndex = stops.length > 0 ? stops[0] : -1;
  const toggleStop = (id: string, i: number) => void api.setQueueStopAfter(chatId, id, !stops.includes(i + 1)).catch(failed);
  // 指示のすぐ前（位置 i）の印を付け外しする（1 件目の上にも置ける）
  const toggleStopBefore = (i: number) =>
    void api.setQueueStops(chatId, stops.includes(i) ? stops.filter((x) => x !== i) : [...stops, i].sort((a, b) => a - b)).catch(failed);
  /**
   * 印の線（指示とは別の行。ドラッグでほかの位置へ移し、× で外す）。同じ位置に何本もあれば本数ぶん重ねて出し、1 本ずつ動かす・外す
   * （見出しの「一時停止」を続けて押すと、いちばん上に重なる）。落とす位置の線は、重なりのいちばん上の線の上・いちばん下の線の下に出す
   */
  const stopLine = (k: number) => {
    const here = stops.filter((x) => x === k).length;
    const mark = dnd.stopMark(k);
    return Array.from({ length: here }, (_, n) => (
      <QueuedStopLine
        key={`stop-${k}-${n}`}
        at={k}
        count={messages.length}
        dragging={dnd.drag?.stop === k && dnd.drag.stopNth === n}
        onDragStart={() => dnd.startStop(k, n)}
        onDragEnd={dnd.end}
        dropMark={(mark === "before" && n === 0) || (mark === "after" && n === here - 1) ? mark : undefined}
        onDragOver={(e) => dnd.overStop(e, k)}
        onDrop={dnd.drop}
        onMove={(to) => void api.setQueueStops(chatId, moveStopOnce(stops, k, to)).catch(failed)}
        onRemove={() => void api.setQueueStops(chatId, removeStopOnce(stops, k)).catch(failed)}
      />
    ));
  };
  // 次に送る指示（1 件目）を書き直していて、作業は終わり、コアが書き直しが終わる（保存・やめる・一覧をたたむ）のを待っている = 送信の準備ができている。
  // 案内は見出しに 1 か所だけ出す（送れなかったなど、ほかの理由で止まっているとき・作業中は出さない）
  const readyForEdit = !collapsed && messages.length > 0 && Boolean(edit.edits[messages[0].id]) && waitingEdit && !busy && !paused;
  const hint = queuedHint({ paused, busy, collapsed, stopIndex, readyForEdit, held: resume !== null });
  // 一時停止の印があって、案内がその止める位置（作業中）か、線で待っていること（作業が終わって 1 件目の上の線）を伝えているとき
  // （queuedHint の印の分かれ道と同じ条件）。止める印と同じ色・同じアイコンで、畳んでいてもひと目で分かるようにする
  const stopHint = !paused && (busy ? stopIndex >= 0 : stopIndex === 0) && !readyForEdit && resume === null;
  // 畳んだ 1 行には、次に送る指示の初めの行も出す（中を開かなくても、次に何が送られるか分かる）
  const next = collapsed && messages.length > 0 ? nextQueuedText(messages[0]) : "";

  return (
    <div className={cx("queued-messages", collapsed && "collapsed", resizing && "resizing")} aria-label="送信待ちの指示">
      {!collapsed && (
        <div className="queued-resizer" aria-label="送信待ちの一覧の高さ" {...resize.handle} />
      )}
      {/* 起動したときの送信待ちの確かめを待っている間は、畳んでいても上に帯を出し、その場で決められるようにする */}
      {resume && <QueueResumeBanner chatId={chatId} resume={resume} />}
      {/* 見出しの行にドラッグして落とすと、いちばん上へ（1 件目の上の一時停止よりも上） */}
      <div className="queued-head-row" onDragOver={dnd.overTop} onDrop={dnd.drop}>
        <div className="queued-head-main">
        <button
          type="button"
          className="queued-head small muted"
          aria-expanded={!collapsed}
          title={`${collapsed ? "送信待ちの一覧を開く" : "送信待ちの一覧をたたむ"}${hint ? `（${hint}）` : ""}`}
          onClick={() => {
            // たたむときは書き直しをやめ、書いている途中の文も捨てる（見えないところで書き直し中のまま、次の指示を止め続けないため）
            if (!collapsed) edit.discardAll();
            setCollapsed(!collapsed);
          }}
        >
          <ChevronRight size={13} className="queued-chevron" aria-hidden />
          <span className="queued-count">送信待ち {messages.length} 件</span>
          {/* 畳んでいる間も、送った指示がチャット欄に出るまでは送信中と分かるようにする */}
          {collapsed && sending.length > 0 && <span className="queued-sending-label">送信中…</span>}
          {selected.length > 0 ? <span className="queued-hint">{selected.length} 件を選択中</span> : hint && (
              <span className={cx("queued-hint", stopHint && "stop", readyForEdit && "ready")}>
                {stopHint && <OctagonPause size={12} aria-hidden />}
                {readyForEdit && <SendHorizontal size={12} aria-hidden />}
                {hint}
              </span>
            )}
          {next && <span className="queued-next">次: {next}</span>}
        </button>
        {/* 溜まって中でスクロールするようになったら、すべて出す・縮めるを切り替えられる（一覧の見え方の操作なので、送る・消すの並びと分けて件数の隣に置く） */}
        {!collapsed && (overflowing || expanded) && (
          <button
            type="button"
            className="btn btn-sm queued-head-btn"
            aria-label={expanded ? "縮めて表示" : "すべて表示"}
            aria-expanded={expanded}
            title={expanded ? "決めた高さに縮め、中でスクロールさせる" : `送信待ちの ${messages.length} 件をすべて表示する（中でスクロールさせない）`}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronsDownUp size={12} aria-hidden /> : <ChevronsUpDown size={12} aria-hidden />}
            <span className="queued-head-label">{expanded ? "縮める" : "すべて表示"}</span>
          </button>
        )}
        </div>
        {/* ここから右が操作（選んでいるときは、選んだものへの操作に入れ替える）。畳んでいる間は一覧と一緒にしまい、1 行だけにする */}
        {!collapsed &&
          (selected.length > 0 ? (
            <QueuedSelectionActions selected={selected} busy={busy} onClearSelection={clearSelection} onEditSelected={editSelected} />
          ) : (
            <QueuedHeadTools count={messages.length} busy={busy} paused={paused} stops={stops} onAdded={() => setCollapsed(false)} />
          ))}
      </div>
      {/* 増えてもチャット欄を押し上げすぎないよう、決めた高さ（初めは 5 件ほど）を超えたら中でスクロールする */}
      {!collapsed && (
        <div ref={listRef} className="queued-list" style={{ maxHeight: expanded ? "none" : Math.max(height, edit.editHeight) }}>
          {/* 送った指示（チャット欄に出たら消える。操作はない） */}
          {sending.map((m) => (
            <QueuedSendingRow key={`sending-${m.id}`} message={m} />
          ))}
          {messages.map((m, i) => (
            <Fragment key={m.id}>
            {/* 一時停止: この行の前で止める印（1 件目の上にも置ける） */}
            {stopLine(i)}
            {edit.edits[m.id] ? (
              <QueuedEditor
                id={m.id}
                index={i}
                withGrip={messages.length > 1}
                busy={busy}
                ready={i === 0 && readyForEdit}
                text={edit.edits[m.id].text}
                attachments={edit.edits[m.id].attachments}
                onChange={(text) => edit.update(m.id, { text })}
                onAttachmentsChange={(attachments) => edit.update(m.id, { attachments })}
                onSave={(attachments) => edit.save(m.id, attachments, false)}
                onSaveAndSend={(attachments) => edit.save(m.id, attachments, true)}
                onCancel={() => edit.cancel(m.id)}
              />
            ) : (
              <QueuedRow
                message={m}
                index={i}
                count={messages.length}
                busy={busy}
                selectedCount={selected.includes(m.id) ? selected.length : 0}
                dragCount={selected.includes(m.id) ? Math.max(1, selected.length) : 1}
                isStop={stops.includes(i + 1)}
                isStopBefore={stops.includes(i)}
                onAsk={
                  ask || askChild
                    ? { newChat: ask && ((remove) => askWith(ask, m.id, remove)), child: askChild && ((remove, inherit) => askWith((ids, r) => askChild(ids, r, inherit), m.id, remove)) }
                    : undefined
                }
                onSelect={(e) => selectRow(e, m.id)}
                groupActions={{
                  edit: editSelected,
                  sendTogether: () => void api.sendAllQueued(chatId, selected).then(clearSelection, failed),
                  merge: () => void api.mergeQueued(chatId, selected).then(clearSelection, failed),
                  moveTo: (to) => void api.moveQueuedMany(chatId, selected, to).catch(failed),
                  remove: () => void api.removeQueuedMany(chatId, selected).then(clearSelection, failed),
                }}
                className={cx(
                  "queued-row",
                  selected.includes(m.id) && "selected",
                  (dnd.drag?.id === m.id || dnd.drag?.ids?.includes(m.id)) && "dragging",
                  // 入る位置の線（動かしても変わらないところには出さない）
                  dnd.rowMark(i) && `drop-${dnd.rowMark(i)}`,
                )}
                actions={{
                  edit: () => edit.start([m]),
                  toggleStop: () => toggleStop(m.id, i),
                  toggleStopBefore: () => toggleStopBefore(i),
                  actionAfter: (action) => void api.queueAction(chatId, action, m.id).then(() => setCollapsed(false), failed),
                  move: (to) => void api.moveQueued(chatId, m.id, to).catch(failed),
                  sendNow: () => void api.sendQueuedNow(chatId, m.id).catch(failed),
                  remove: () => void api.removeQueued(chatId, m.id).catch(failed),
                }}
                onDragStart={() => dnd.startMessage(m.id, selected.includes(m.id) && selected.length > 1 ? selected : undefined)}
                onDragEnd={dnd.end}
                onDragOver={(e) => dnd.overRow(e, i)}
                onDrop={dnd.drop}
              />
            )}
            </Fragment>
          ))}
          {/* すべて送ったあとで止める印（その作業のあいだに来た指示の前で止める） */}
          {stopLine(messages.length)}
        </div>
      )}
    </div>
  );
}
