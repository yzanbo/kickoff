import { ChevronRight, ChevronsDownUp, ChevronsUpDown, Pause, Play, X } from "lucide-react";
import { Fragment, useLayoutEffect, useRef, useState, type DragEvent, type PointerEvent } from "react";
import { IconButton } from "../IconButton";
import type { QueuedMessage } from "../../../../core/types";
import { api } from "../../api";
import { QueuedHeadActions } from "./QueuedHeadActions";
import { QueuedEditor, QueuedRow } from "./QueuedRow";
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
 * いまの作業が終わったら（止めた・失敗したときも）先頭から順に送る。並べ替え・消す・すぐ送る（作業中なら止めてから送る）ができる。
 * 見出しに送信待ちの数、行に添付（1 つ目のサムネイルと、ほかの数）を出す。5 件ほどを超えたら一覧の中でスクロールし（上端のつまみのドラッグで高さを変えられ、見出しの「すべて表示」でスクロールさせずにすべて出せる）、狭い欄では ↑↓ とボタンの文字を隠す（右クリックのメニューに同じ操作がある）。
 * ⌘ / Shift ＋クリックで行を選ぶと、選んだものだけをまとめて送る・消す・いちばん上か下へ移せる（見出しと右クリック。Esc でやめる）。
 * 行は左のつまみのドラッグでも並べ替えられる（↑↓ のボタンと同じ。文は選んでコピーできる）。行のダブルクリックで書き直す。見出しの右の「n 件をまとめて送る」は、すべてを 1 つにまとめてすぐ送り、「n 件すべて消す」はすべて消す（確かめてから）。どちらも 2 件以上のときだけ出す。
 * 行の右クリックの「ここまで自動で送る」で、その指示を送ったら残りを止めておける（途中まで自動で送る。印の行の下に線を出す）。
 * 見出しの「自動で送る / 止めておく」で、いまの作業が終わったときに先頭を自動で送るか、送らずに止めておくかを切り替える
 * （チャットごと。止めておくと、行の「すぐ送る」で 1 件ずつ送れる。送り終えて列が空になったら、自動で送るに戻る）。
 * 見出しを押すとたたみ、「送信待ち n 件の追加があります」の 1 行だけにする（ためるほど縦に長くなるため。どのチャットでも同じに覚える）
 */
export function QueuedMessages({
  runId,
  queue,
  paused,
  stopAfter,
  busy,
}: {
  runId: number;
  queue: QueuedMessage[];
  paused: boolean;
  /** 「ここまで自動で送る」の印を付けた指示（その指示を送ったら止めておく） */
  stopAfter: string | null;
  busy: boolean;
}) {
  const [collapsed, setCollapsed] = useStoredFlag(QUEUE_COLLAPSED_KEY);
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
  const [editing, setEditing] = useState<{ id: string; text: string }>();
  // ドラッグで並べ替えている指示（from: 元の位置）と、入れる位置（at: 0〜件数。その位置の行の前に入れる）。
  // ids: 選んだ行をつかんだときは、選んだものをまとめて動かす
  const [drag, setDrag] = useState<{ id: string; from: number; at?: number; ids?: string[] }>();
  /** ドラッグ中の行の上: 行の上半分なら前、下半分なら後ろに入れる位置にする */
  const dragOver = (e: DragEvent<HTMLDivElement>, i: number) => {
    if (!drag) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    const at = e.clientY < rect.top + rect.height / 2 ? i : i + 1;
    if (at !== drag.at) setDrag({ ...drag, at });
  };
  const drop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (drag?.at !== undefined && drag.ids) {
      // まとめて動かす: 落とした位置から下で、動かさない最初の指示の前へ入れる（なければいちばん下）
      const ids = drag.ids;
      const before = queue.slice(drag.at).find((m) => !ids.includes(m.id))?.id ?? null;
      void api.moveQueuedMany(runId, ids, { before }).catch(failed);
    } else if (drag?.at !== undefined) {
      // 移したあとの位置（元の位置より後ろへ入れるときは、自分が抜けた分だけ 1 つ前になる）
      const index = drag.at > drag.from ? drag.at - 1 : drag.at;
      if (index !== drag.from) void api.moveQueued(runId, drag.id, index).catch(failed);
    }
    setDrag(undefined);
  };
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
  const failed = reportFailure("待ちの指示を操作できませんでした");
  // 「ここまで自動で送る」の印の位置（なければ -1）
  const stopIndex = stopAfter ? queue.findIndex((m) => m.id === stopAfter) : -1;
  const clearStop = () => void api.setQueueStopAfter(runId, null).catch(failed);
  // 見出し: 件数と、短い案内（実行中はいつも 1 件なので数えない。件数は見出しだけに出し、ボタンでくり返さない）
  const hint = paused
    ? collapsed
      ? "止めています"
      : busy
        ? "終わっても送らずに止めておきます"
        : "止めています。行の「すぐ送る」で 1 件ずつ送れます"
    : !busy
      ? "自動で送れませんでした。行の「すぐ送る」で送れます"
      : collapsed
        ? ""
        : stopIndex >= 0
          ? `終わったら ${stopIndex + 1} 件目まで順に送り、そのあとは止めます`
          : "終わったら順に送ります";
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
      <div className="queued-head-row">
        <button
          type="button"
          className="queued-head small muted"
          aria-expanded={!collapsed}
          title={collapsed ? "送信待ちの一覧を開く" : "送信待ちの一覧をたたむ"}
          onClick={() => setCollapsed(!collapsed)}
        >
          <ChevronRight size={13} className="queued-chevron" aria-hidden />
          <span className="queued-count">送信待ち {queue.length} 件</span>
          {selected.length > 0 ? <span className="queued-hint">{selected.length} 件を選択中</span> : hint && <span className="queued-hint">{hint}</span>}
        </button>
        {/* 終わったら自動で送るか、送らずに止めておくか（いまの状態を出し、押すと切り替える） */}
        <button
          type="button"
          className={cx("btn btn-sm queued-head-btn queued-mode", paused && "paused")}
          aria-pressed={paused}
          aria-label={paused ? "止めています（押すと、自動で送るに戻す）" : "自動で送ります（押すと、送らずに止めておく）"}
          title={
            paused
              ? `いまの作業が終わっても送らずに止めておきます。行の「すぐ送る」で 1 件ずつ送れます。押すと、自動で送るに戻します${busy ? "" : "（先頭をすぐ送ります）"}`
              : "いまの作業が終わったら、先頭から順に自動で送ります。押すと、送らずに止めておきます（移動の前などに）"
          }
          onClick={() => void api.setQueuePaused(runId, !paused).catch(failed)}
        >
          {paused ? <Pause size={12} aria-hidden /> : <Play size={12} aria-hidden />}
          <span className="queued-head-label">{paused ? "止めています" : "自動で送る"}</span>
        </button>
        {/* 溜まって中でスクロールするようになったら、すべて出す・縮めるを切り替えられる */}
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
        <QueuedHeadActions runId={runId} count={queue.length} selected={selected} busy={busy} onClearSelection={clearSelection} failed={failed} />
      </div>
      {/* 増えてもチャット欄を押し上げすぎないよう、決めた高さ（初めは 5 件ほど）を超えたら中でスクロールする */}
      {!collapsed && (
        <div ref={listRef} className="queued-list" style={{ maxHeight: expanded ? "none" : Math.max(height, editHeight) }}>
          {queue.map((m, i) => (
            <Fragment key={m.id}>
            {editing?.id === m.id ? (
              <QueuedEditor
                index={i}
                withGrip={queue.length > 1}
                attachments={m.attachments}
                text={editing.text}
                onChange={(text) => setEditing({ id: m.id, text })}
                onSave={() => void api.editQueued(runId, m.id, editing.text).then(() => setEditing(undefined), failed)}
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
                isStop={i === stopIndex}
                onSelect={(e) => selectRow(e, m.id)}
                groupActions={{
                  sendTogether: () => void api.sendAllQueued(runId, selected).then(clearSelection, failed),
                  moveTo: (to) => void api.moveQueuedMany(runId, selected, to).catch(failed),
                  remove: () => void api.removeQueuedMany(runId, selected).then(clearSelection, failed),
                }}
                className={cx(
                  "queued-row",
                  selected.includes(m.id) && "selected",
                  (drag?.id === m.id || drag?.ids?.includes(m.id)) && "dragging",
                  // 入る位置の線（1 件のときは、元の位置と変わらないところには出さない）
                  drag && drag.at === i && (drag.ids || (drag.from !== i && drag.from !== i - 1)) && "drop-before",
                  drag && drag.at === i + 1 && i === queue.length - 1 && (drag.ids || drag.from !== i) && "drop-after",
                )}
                actions={{
                  edit: () => setEditing({ id: m.id, text: m.text }),
                  toggleStop: () => void api.setQueueStopAfter(runId, i === stopIndex ? null : m.id).catch(failed),
                  move: (to) => void api.moveQueued(runId, m.id, to).catch(failed),
                  sendNow: () => void api.sendQueuedNow(runId, m.id).catch(failed),
                  remove: () => void api.removeQueued(runId, m.id).catch(failed),
                }}
                onDragStart={() => setDrag({ id: m.id, from: i, ids: selected.includes(m.id) && selected.length > 1 ? selected : undefined })}
                onDragEnd={() => setDrag(undefined)}
                onDragOver={(e) => dragOver(e, i)}
                onDrop={drop}
              />
            )}
            {/* 「ここまで自動で送る」: この行を送ったら止める線（最後の行なら、すべて送ったあとに来たものから止める） */}
            {i === stopIndex && (
              <div className="queued-stop-line" role="note">
                <span>ここまで送ったら止めます</span>
                <IconButton icon={X} size={11} label="ここで止めるのをやめる" onClick={clearStop} />
              </div>
            )}
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
