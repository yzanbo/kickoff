import { ChevronRight, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { Fragment, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import type { Attachment, QueuedMessage } from "../../../../core/types";
import { api } from "../../api";
import { QueuedHeadActions, QueuedModeButton, QueuedMoveActions } from "./QueuedHeadActions";
import { QueuedEditor } from "./QueuedEditor";
import { QueuedRow } from "./QueuedRow";
import { QueuedStopLine } from "./QueuedStopLine";
import { useQueueDrag } from "./useQueueDrag";
import { useAskInNewChat } from "./askInNewChat";
import { nextQueuedText, queuedHint } from "./queuedHint";
import type { NewChatTarget } from "../sidePanel/useSidePanel";
import { useWindowEvent } from "../../hooks/useWindowEvent";
import { cx } from "../../cx";
import { reportFailure } from "../../runActions";
import { startVerticalDrag } from "../../hooks/dragResize";
import { useStoredFlag, useStoredNumber } from "../../hooks/useStoredState";
import { QUEUE_COLLAPSED_KEY, QUEUE_EXPANDED_KEY, QUEUE_HEIGHT_KEY } from "../../storageKeys";

/** 一覧の高さの上限の初め（5 件ほど）と、つまみで縮められる下限（1 件ほど） */
const DEFAULT_LIST_HEIGHT = 150;
const MIN_LIST_HEIGHT = 36;

/**
 * 作業中に送った次の指示の待ちの列（チャット欄のすぐ上）。
 * いまの作業が終わったら（止めた・失敗したときも）先頭から順に送る。並べ替え・消す・すぐ送る（作業中なら止めずに、いまのやり取りに伝える）ができる。
 * 見出しに送信待ちの数、行に添付（1 つ目のサムネイルと、ほかの数）を出す。5 件ほどを超えたら一覧の中でスクロールし（上端のつまみのドラッグで高さを変えられ、見出しの「すべて表示」でスクロールさせずにすべて出せる）、狭い欄では ↑↓ とボタンの文字を隠す（右クリックのメニューに同じ操作がある）。
 * ⌘ / Shift ＋クリックで行を選ぶと、選んだものだけをまとめて送る・消す・いちばん上か下へ移せる（見出しと右クリック。Esc でやめる）。
 * 行は左のつまみのドラッグでも並べ替えられる（↑↓ のボタンと同じ。文は選んでコピーできる）。行のダブルクリックで書き直す。見出しの右の「n 件をまとめて送る」は、すべてを 1 つにまとめてすぐ送り、「n 件すべて消す」はすべて消す（確かめてから）。どちらも 2 件以上のときだけ出す。
 * 「ここまで送ったら止めます」の線（指示とは別の行。ドラッグで動かせ、1 件目の上にも置ける）まで自動で送ったら、残りは止めておく。
 * 行の右クリックの「この指示のあとで止める」でも付けられる。
 * 見出しの「自動で送る / 止めておく」で、いまの作業が終わったときに先頭を自動で送るか、送らずに止めておくかを切り替える
 * （チャットごと。止めておくと、行の「すぐ送る」で 1 件ずつ送れる。送り終えて列が空になったら、自動で送るに戻る）。
 * 初めは畳み、「送信待ち n 件・止める位置・次: 次に送る指示の初めの行」の 1 行だけにする（ためるほど流れが狭くなるため。見出しを押すと開き、どのチャットでも同じに覚える）。
 * 入力欄のすぐ上に区切り線だけでつなげ、1 枚の枠に見せる（queued.css）
 */
export function QueuedMessages({
  runId,
  queue,
  paused,
  stops,
  busy,
  newChatTarget,
}: {
  runId: number;
  /** 「新しいチャットで聞く」で作るチャットのプロジェクト・グループ（元のチャットと同じ） */
  newChatTarget: NewChatTarget;
  queue: QueuedMessage[];
  paused: boolean;
  /** 「ここまで送ったら止めます」の印の位置（0 = 1 件目の上、n = n 件目のあと。いくつでも） */
  stops: number[];
  busy: boolean;
}) {
  const [collapsed, setCollapsed] = useStoredFlag(QUEUE_COLLAPSED_KEY, true);
  // 中でスクロールさせずにすべて出すか（どのチャットでも同じに覚える）と、いま中でスクロールするほど溜まっているか
  const [expanded, setExpanded] = useStoredFlag(QUEUE_EXPANDED_KEY);
  const listRef = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  // 一覧の高さの上限（上端のつまみのドラッグで変える。ダブルクリックで元の高さ）
  const [height, setHeight] = useStoredNumber(QUEUE_HEIGHT_KEY, DEFAULT_LIST_HEIGHT);
  const [resizing, setResizing] = useState(false);
  /** つまみのドラッグ: 上へ動かすほど高く（いま見えている高さから。上限は画面の高さの 6 割）。ドラッグ中は描き直さず、style だけ書き換える */
  const startResize = (e: PointerEvent<HTMLElement>) => {
    const list = listRef.current;
    if (!list) return;
    const startY = e.clientY;
    const startHeight = list.clientHeight;
    const max = Math.max(MIN_LIST_HEIGHT, Math.round(window.innerHeight * 0.6));
    let next = startHeight;
    setResizing(true);
    startVerticalDrag(e, {
      move: (clientY) => {
        next = Math.round(Math.max(MIN_LIST_HEIGHT, Math.min(max, startHeight + startY - clientY)));
        list.style.maxHeight = `${next}px`;
      },
      end: () => {
        setResizing(false);
        setHeight(next);
        // 高さを決めたら、すべて表示はやめる（決めた高さで中をスクロールさせる）
        setExpanded(false);
      },
    });
  };
  // ⌘ / Ctrl ＋クリックで 1 件ずつ、Shift ＋クリックで範囲を選ぶ（選んだものだけ、まとめて送る・消す・移す）。消えた指示は外す
  const [picked, setPicked] = useState<string[]>([]);
  const [anchor, setAnchor] = useState<string>();
  const selected = queue.filter((m) => picked.includes(m.id)).map((m) => m.id);
  const clearSelection = () => {
    setPicked([]);
    setAnchor(undefined);
  };
  /** 行のクリック（修飾キーがなければ、選んでいるものをやめるだけ） */
  const selectRow = (e: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }, id: string) => {
    if (e.shiftKey && anchor) {
      const from = queue.findIndex((m) => m.id === anchor);
      const to = queue.findIndex((m) => m.id === id);
      const range = queue.slice(Math.min(from, to), Math.max(from, to) + 1).map((m) => m.id);
      setPicked((prev) => [...new Set([...(e.metaKey || e.ctrlKey ? prev : []), ...range])]);
    } else if (e.metaKey || e.ctrlKey || e.shiftKey) {
      setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
      setAnchor(id);
    } else if (selected.length > 0) {
      clearSelection();
    }
  };
  // Esc で選ぶのをやめる（パネルを閉じる Esc より先に受け取る）
  useWindowEvent(
    "keydown",
    (e) => {
      // メニュー・ダイアログが開いているときは、そちらを閉じる Esc に任せる
      if (e.key !== "Escape" || document.querySelector("[role=menu], dialog[open]")) return;
      e.stopPropagation();
      clearSelection();
    },
    selected.length > 0,
    true,
  );
  // 書き直している指示（id と書いている途中の文）
  const [editing, setEditing] = useState<{ id: string; text: string; attachments: Attachment[] }>();
  const failed = reportFailure("待ちの指示を操作できませんでした");
  // ドラッグ: 指示の並べ替えと、「ここまで送ったら止めます」の印の移動
  const dnd = useQueueDrag(runId, queue, stops, failed);
  // 右クリックの「新しいチャットで聞く / 移す」（文と添付を新しいチャットのタブに入れて開く。パネルの外では出さない）
  const ask = useAskInNewChat(runId, queue, newChatTarget);
  // 書き直している行の高さ（文を中でスクロールさせず全部見せるため、一覧の高さの上限をこれより低くしない）
  const [editHeight, setEditHeight] = useState(0);
  useLayoutEffect(() => {
    const row = editing ? listRef.current?.querySelector<HTMLElement>(".queued-row.editing") : null;
    setEditHeight(row ? row.offsetHeight + 8 : 0);
    row?.scrollIntoView({ block: "nearest" });
  }, [editing?.id, editing?.text]);
  // 一覧の高さが上限を超えたか（超えたときだけ「すべて表示」を出す。すべて出している間は「縮める」を出したまま）
  useLayoutEffect(() => {
    const el = listRef.current;
    setOverflowing(Boolean(el && !expanded && el.scrollHeight > el.clientHeight + 1));
  }, [queue, editing, collapsed, expanded, height]);
  if (queue.length === 0) return null;
  // 次に止まる位置（いちばん上の印。なければ -1）。行の右クリックの「この指示のあとで止める」は、その行のすぐあとの印を付け外しする
  const stopIndex = stops.length > 0 ? stops[0] : -1;
  const toggleStop = (id: string, i: number) => void api.setQueueStopAfter(runId, id, !stops.includes(i + 1)).catch(failed);
  // 指示のすぐ前（位置 i）の印を付け外しする（1 件目の上にも置ける）
  const toggleStopBefore = (i: number) =>
    void api.setQueueStops(runId, stops.includes(i) ? stops.filter((x) => x !== i) : [...stops, i].sort((a, b) => a - b)).catch(failed);
  /** 印の線（指示とは別の行。ドラッグでほかの位置へ移し、× で外す） */
  const stopLine = (k: number) =>
    stops.includes(k) && (
      <QueuedStopLine
        at={k}
        count={queue.length}
        dragging={dnd.drag?.stop === k}
        onDragStart={() => dnd.startStop(k)}
        onDragEnd={dnd.end}
        dropMark={dnd.stopMark(k)}
        onDragOver={(e) => dnd.overStop(e, k)}
        onDrop={dnd.drop}
        onMove={(to) => void api.setQueueStops(runId, [...stops.filter((x) => x !== k), to]).catch(failed)}
        onRemove={() => void api.setQueueStops(runId, stops.filter((x) => x !== k)).catch(failed)}
      />
    );
  const hint = queuedHint({ paused, busy, collapsed, stopIndex });
  // 畳んだ 1 行には、次に送る指示の初めの行も出す（中を開かなくても、次に何が送られるか分かる）
  const next = collapsed ? nextQueuedText(queue[0]) : "";
  return (
    <div className={cx("queued-messages", collapsed && "collapsed", resizing && "resizing")} aria-label="送信待ちの指示">
      {!collapsed && (
        <div
          className="queued-resizer"
          role="separator"
          aria-orientation="horizontal"
          aria-label="送信待ちの一覧の高さ"
          title="ドラッグで高さを変える（ダブルクリックで元に戻す）"
          onPointerDown={startResize}
          onDoubleClick={() => {
            setHeight(DEFAULT_LIST_HEIGHT);
            setExpanded(false);
          }}
        />
      )}
      {/* 見出しの行にドラッグして落とすと、いちばん上へ（1 件目の上の「ここまで送ったら止めます」よりも上） */}
      <div className="queued-head-row" onDragOver={dnd.overTop} onDrop={dnd.drop}>
        <button
          type="button"
          className="queued-head small muted"
          aria-expanded={!collapsed}
          title={`${collapsed ? "送信待ちの一覧を開く" : "送信待ちの一覧をたたむ"}${hint ? `（${hint}）` : ""}`}
          onClick={() => setCollapsed(!collapsed)}
        >
          <ChevronRight size={13} className="queued-chevron" aria-hidden />
          <span className="queued-count">送信待ち {queue.length} 件</span>
          {selected.length > 0 ? <span className="queued-hint">{selected.length} 件を選択中</span> : hint && <span className="queued-hint">{hint}</span>}
          {next && <span className="queued-next">次: {next}</span>}
        </button>
        {/* 溜まって中でスクロールするようになったら、すべて出す・縮めるを切り替えられる（一覧の見え方の操作なので、送る・消すの並びと分けて件数の隣に置く） */}
        {!collapsed && (overflowing || expanded) && (
          <button
            type="button"
            className="btn btn-sm queued-head-btn"
            aria-label={expanded ? "縮めて表示" : "すべて表示"}
            aria-expanded={expanded}
            title={expanded ? "決めた高さに縮め、中でスクロールさせる" : `送信待ちの ${queue.length} 件をすべて表示する（中でスクロールさせない）`}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronsDownUp size={12} aria-hidden /> : <ChevronsUpDown size={12} aria-hidden />}
            <span className="queued-head-label">{expanded ? "縮める" : "すべて表示"}</span>
          </button>
        )}
        {/* 終わったら自動で送るか、送らずに止めておくか（列全体の設定。ここから右が操作） */}
        <QueuedModeButton runId={runId} paused={paused} busy={busy} failed={failed} />
        {/* 選んでいるときは、行と同じ 2 つのまとまり: 並べ替え（いちばん上へ・下へ）｜ 選んだものへの操作（まとめて送る・消す・選ぶのをやめる） */}
        {selected.length > 0 && <QueuedMoveActions runId={runId} selected={selected} failed={failed} />}
        <QueuedHeadActions runId={runId} count={queue.length} selected={selected} busy={busy} holds={paused || stops.length > 0} onClearSelection={clearSelection} failed={failed} />
      </div>
      {/* 増えてもチャット欄を押し上げすぎないよう、決めた高さ（初めは 5 件ほど）を超えたら中でスクロールする */}
      {!collapsed && (
        <div ref={listRef} className="queued-list" style={{ maxHeight: expanded ? "none" : Math.max(height, editHeight) }}>
          {queue.map((m, i) => (
            <Fragment key={m.id}>
            {/* 「ここまで送ったら止めます」: この行の前で止める印（1 件目の上にも置ける） */}
            {stopLine(i)}
            {editing?.id === m.id ? (
              <QueuedEditor
                index={i}
                withGrip={queue.length > 1}
                text={editing.text}
                attachments={editing.attachments}
                onChange={(text) => setEditing({ ...editing, text })}
                onAttachmentsChange={(attachments) => setEditing({ ...editing, attachments })}
                onSave={(attachments) => void api.editQueued(runId, m.id, editing.text, attachments).then(() => setEditing(undefined), failed)}
                onCancel={() => setEditing(undefined)}
              />
            ) : (
              <QueuedRow
                message={m}
                index={i}
                count={queue.length}
                busy={busy}
                selectedCount={selected.includes(m.id) ? selected.length : 0}
                dragCount={selected.includes(m.id) ? Math.max(1, selected.length) : 1}
                isStop={stops.includes(i + 1)}
                isStopBefore={stops.includes(i)}
                onAsk={
                  ask &&
                  ((remove) => {
                    ask(selected.includes(m.id) && selected.length > 1 ? selected : [m.id], remove);
                    clearSelection();
                  })
                }
                onSelect={(e) => selectRow(e, m.id)}
                groupActions={{
                  sendTogether: () => void api.sendAllQueued(runId, selected).then(clearSelection, failed),
                  merge: () => void api.mergeQueued(runId, selected).then(clearSelection, failed),
                  moveTo: (to) => void api.moveQueuedMany(runId, selected, to).catch(failed),
                  remove: () => void api.removeQueuedMany(runId, selected).then(clearSelection, failed),
                }}
                className={cx(
                  "queued-row",
                  selected.includes(m.id) && "selected",
                  (dnd.drag?.id === m.id || dnd.drag?.ids?.includes(m.id)) && "dragging",
                  // 入る位置の線（動かしても変わらないところには出さない）
                  dnd.rowMark(i) && `drop-${dnd.rowMark(i)}`,
                )}
                actions={{
                  edit: () => setEditing({ id: m.id, text: m.text, attachments: m.attachments }),
                  toggleStop: () => toggleStop(m.id, i),
                  toggleStopBefore: () => toggleStopBefore(i),
                  move: (to) => void api.moveQueued(runId, m.id, to).catch(failed),
                  sendNow: () => void api.sendQueuedNow(runId, m.id).catch(failed),
                  remove: () => void api.removeQueued(runId, m.id).catch(failed),
                }}
                onDragStart={() => dnd.startMessage(m.id, selected.includes(m.id) && selected.length > 1 ? selected : undefined)}
                onDragEnd={dnd.end}
                onDragOver={(e) => dnd.overRow(e, i)}
                onDrop={dnd.drop}
              />
            )}
            </Fragment>
          ))}
          {/* すべて送ったあとで止める印（あとから来た指示の前で止める） */}
          {stopLine(queue.length)}
        </div>
      )}
    </div>
  );
}
