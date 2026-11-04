import { ArrowDown } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { cx } from "../../cx";
import { RUN_STATUS_LABELS } from "../RunStatus";
import { useTicker } from "../../hooks/useTicker";
import { useWindowEvent } from "../../hooks/useWindowEvent";
import type { Approval, BackgroundState, Run, RunEvent } from "../../../../core/types";
import type { SubagentEntry } from "../../../../core/subagents";
import { activityOf, latestOf, stalledAgents } from "./stall";
import { lastResultIdOf, workingLabel, type RunActivity } from "./workingLabel";
import { BackgroundTasks } from "./BackgroundTasks";
import { Markdown } from "../Markdown";
import { ApprovalCard } from "./ApprovalCard";
import { ReconnectRow, type Connection } from "./ConnectionStatus";
import { jumpToEvent } from "./jumpToEvent";
import { promptAbove, promptAttachments, STICKY_PROMPT_HEIGHT, StickyPrompt } from "./StickyPrompt";
import { TimelineItems, Working } from "./Timeline";
import type { TimelineItem } from "./timelineItems";
import { useMarkSeen } from "./useMarkSeen";

/**
 * 窓の外の項目を足し始める、端からの距離（画面の高さに対する割合と、最低限の px）。
 * 端に着いてから足すと、トラックパッドの慣性が端で止まり「途中で止まる」ように見えるので、ずっと手前で足しておく
 */
const LOAD_AHEAD_VIEWPORTS = 1.5;
const LOAD_AHEAD_MIN_PX = 600;

/** 一番下を見ているとみなす、下端からの距離（これより上にスクロールしたら、新しい発言に付いていかない） */
const BOTTOM_SLACK_PX = 80;

/**
 * チャットの発言の流れ（発言とツールのまとまり・生成中の返答・確認のカード・作業中の行）。
 * 一番下を見ているときだけ、新しい発言に合わせてスクロールする（stickToBottom。送ったら親が true に戻す）。
 * 上にスクロールしている間は、一番下へ戻るボタンを出す（⌘↓ でも戻る）。答えを待っているとき・その間に作業が終わったときは、
 * ボタンに文を添えて目立たせ、下へ戻るよう誘う。
 * focus（検索結果から開いた発言）があれば、そこまでスクロールして一瞬強調する
 */
export function RunTimeline({
  items,
  lastItem,
  rel,
  hidden = 0,
  onShowMore,
  after = 0,
  onShowLater,
  onLatest,
  onAtBottom,
  run,
  busy,
  agents = [],
  onOpenSubagent,
  background = null,
  connection,
  waiting,
  stopping,
  live,
  approvals,
  focus,
  stickToBottom,
  events,
  visible,
  children,
}: {
  items: TimelineItem[];
  /** 流れ全体の最後の項目（窓で途中を描いていても、作業中の文はいまの状態で決める） */
  lastItem: TimelineItem | undefined;
  rel: (s: string) => string;
  run: Run;
  busy: boolean;
  /** 窓の外（上）にあって描いていない項目の数と、それを足す操作（長いチャットでは最近の項目だけを描く） */
  hidden?: number;
  onShowMore?: () => void;
  /** 窓の外（下）にあって描いていない項目の数（検索などで途中の一部分を描いているとき）と、それを足す操作・最新の窓に戻す操作 */
  after?: number;
  onShowLater?: () => void;
  onLatest?: () => void;
  /** 一番下へ戻った（足した前の項目を外して、描く量を元に戻す） */
  onAtBottom?: () => void;
  /** チャットのサブエージェント（実行中の数・長く動きのないもの・裏の作業の一覧から中身を開く） */
  agents?: SubagentEntry[];
  /** サブエージェントの中身をパネルのタブで開く */
  onOpenSubagent?: (entry: SubagentEntry) => void;
  /** 裏で動いている作業と、メインの返答が終わったか（返答のあとに待っているものを、種類と名前で出す） */
  background?: BackgroundState | null;
  /** 通信の再試行中・止まってつながるのを待っているところ */
  connection: Connection;
  waiting: boolean;
  /** 停止を押して、止まるのを待っている */
  stopping: boolean;
  live: string;
  approvals: Approval[];
  focus?: number;
  stickToBottom: RefObject<boolean>;
  /** 会話の記録（最新の結果を一番下まで見たら既読にする） */
  events: RunEvent[];
  /** チャットを表示しているか（パネルの裏のタブ・閉じたパネルは見ていない） */
  visible: boolean;
  /** 流れの上に重ねるもの（右端の指示の目次） */
  children?: ReactNode;
}) {
  const timelineRef = useRef<HTMLDivElement>(null);
  // 一番下から離れているか（一番下へ戻るボタンを出す）
  const [away, setAway] = useState(false);
  // 上を読んでいる間に作業が終わったか（一番下へ戻るボタンで知らせる。一番下へ戻ったら消す）
  const lastResultId = lastResultIdOf(events);
  const awayFromResult = useRef<number | null>(null);
  if (!away) awayFromResult.current = null;
  else awayFromResult.current ??= lastResultId;
  const finishedWhileAway = away && awayFromResult.current !== null && lastResultId > awayFromResult.current;
  // 上に貼り付けておく自分の発言（読んでいる返答の元の発言）
  const [pinned, setPinned] = useState<{ id: number; text: string }>();
  const pinnedAttachments = useMemo(() => (pinned ? promptAttachments(events, pinned.id) : []), [pinned, events]);
  const stickyHeight = useRef(STICKY_PROMPT_HEIGHT); // 貼り付けた帯の高さ（その下端を、指示が見えているかの線にする）
  // 窓の最初と最後の項目（前を足した・新しい発言が届いたを見分ける）
  const firstKey = items[0]?.key;
  const lastKey = items[items.length - 1]?.key;
  // 本当に動いているかの目安: 最後に何かが届いた時刻（記録・書いている途中の返答・サブエージェントの動き）。
  // Claude Code に問い合わせる手段はないので、1 秒ごとの描き直しで、長く動きがなければ知らせる
  // 何も届かない間も、動きの様子（「n 分動きがありません」）を進めるため、作業中は定期的に描き直す（流れの各項目は memo しているので軽い）
  useTicker(busy ? 15_000 : 3_600_000);
  const liveAt = useRef<string>(undefined);
  useEffect(() => {
    if (live) liveAt.current = new Date().toISOString();
  }, [live]);
  const runningAgents = agents.filter((s) => s.status === "running").length;
  const activity: RunActivity = {
    parent: activityOf(latestOf(events.at(-1)?.created_at, liveAt.current, run.turn_started_at, ...agents.filter((s) => s.status === "running").map((s) => s.lastActivityAt))),
    stalled: busy ? stalledAgents(agents) : [],
  };

  // 検索結果から開いたときは、その発言までスクロールして一瞬強調する
  useEffect(() => {
    if (!focus) return;
    if (!timelineRef.current || !jumpToEvent(timelineRef.current, focus)) return;
    stickToBottom.current = false;
  }, [focus, lastKey, stickToBottom]);

  // 前の項目を足したら、読んでいた位置を動かさない（上に足した分だけ下げる）
  const beforeMore = useRef<{ height: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = timelineRef.current;
    const prev = beforeMore.current;
    if (!el || !prev) return;
    beforeMore.current = null;
    // ふつうはブラウザのスクロールアンカーがもう位置を合わせている。合っていないときだけ直す
    // （書き換えると、トラックパッドの慣性のスクロールがそこで止まる）
    const expected = prev.top + (el.scrollHeight - prev.height);
    if (Math.abs(el.scrollTop - expected) > 1) el.scrollTop = expected;
  }, [firstKey]);
  const showMore = () => {
    const el = timelineRef.current;
    if (!el || !onShowMore || beforeMore.current) return;
    beforeMore.current = { height: el.scrollHeight, top: el.scrollTop };
    onShowMore();
  };

  // 一番下を見ているときだけ、新しい発言に合わせてスクロールする
  useEffect(() => {
    const el = timelineRef.current;
    if (el && stickToBottom.current && !focus) el.scrollTop = el.scrollHeight;
    // 窓（最近の項目だけ描く）は数が変わらないまま進むので、最後の項目で新しい発言を見分ける
  }, [lastKey, approvals.length, live, focus, stickToBottom]);

  // 最新の結果を一番下まで見たら既読にする（新しい発言に合わせたスクロールの後で確かめる）
  useMarkSeen({ timelineRef, run, events, visible, away, slackPx: BOTTOM_SLACK_PX });

  // 途中の一部分を描いているときに一番下へ戻る: 最新の窓に戻して、描いてから一番下へ
  const toLatest = useRef(false);
  useLayoutEffect(() => {
    const el = timelineRef.current;
    if (!el || !toLatest.current || after > 0) return;
    toLatest.current = false;
    el.scrollTop = el.scrollHeight;
  }, [lastKey, after]);
  function scrollToBottom() {
    const el = timelineRef.current;
    if (!el) return;
    stickToBottom.current = true;
    if (after > 0) {
      toLatest.current = true;
      onLatest?.();
      return;
    }
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }

  // ⌘↓ で一番下へ（このチャットの中にピントがあり、上を読んでいるとき。入力欄の中でも効く）
  useWindowEvent("keydown", (e) => {
    if (!away || !e.metaKey || e.altKey || e.ctrlKey || e.shiftKey || e.key !== "ArrowDown") return;
    const panel = timelineRef.current?.closest(".run-panel");
    if (!panel?.contains(document.activeElement)) return;
    e.preventDefault();
    scrollToBottom();
  });

  // ボタンに出すいまの状態（上を読んでいる間も、このチャットがどうなっているかが分かるように）。
  // 答えを待っている・その間に返答が届いたときは目立たせて下へ誘い、作業中はいまの段階、終わっていれば結果を出す
  // 通信が切れている（再試行中・つながるのを待っている）ときは黄にする
  const pill: { label: ReactNode; tone: "waiting" | "arrived" | "working" | "idle" | "failed" | "offline" } = waiting
    ? { label: "回答を待っています", tone: "waiting" }
    : !busy && connection.reconnect
      ? { label: "通信待ち（つながったら自動で再開）", tone: "offline" }
      : finishedWhileAway
        ? { label: run.status === "failed" ? "失敗しました" : "返答が届きました", tone: run.status === "failed" ? "failed" : "arrived" }
        : busy
          ? { label: workingLabel(run, lastItem, live, stopping, runningAgents, connection, background, activity), tone: connection.retry ? "offline" : "working" }
          : { label: RUN_STATUS_LABELS[run.status], tone: run.status === "failed" ? "failed" : "idle" };

  return (
    <div className="timeline-wrap">
      {/* 押すとピントが入り、↑↓・PageUp / PageDown・End でもスクロールできる（枠は出さない） */}
      <div
        className="timeline"
        ref={timelineRef}
        tabIndex={-1}
        onScroll={(e) => {
          const el = e.currentTarget;
          const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
          // 途中の一部分を描いているときは、下の端まで来ても最新ではない
          const atBottom = after === 0 && fromBottom < BOTTOM_SLACK_PX;
          stickToBottom.current = atBottom;
          setAway(!atBottom);
          if (atBottom) onAtBottom?.();
          // 上の端に近づいたら（着く前に）、窓の外の前の項目を足す
          const ahead = Math.max(LOAD_AHEAD_MIN_PX, el.clientHeight * LOAD_AHEAD_VIEWPORTS);
          // （一番下にいるときは足さない。窓が短いと、一番下で窓を戻す処理と行き来するため）
          if (hidden > 0 && !atBottom && el.scrollTop < ahead) showMore();
          // 下の端に近づいたら、窓の外の後ろの項目を足す（下に足すので、読んでいた位置は動かない）
          if (after > 0 && fromBottom < ahead) onShowLater?.();
          // 帯の高さは、出していないときは前に出したときのもの（開いた全文の帯でも、出す・引っ込めるが行き来しないように）
          const bar = el.parentElement?.querySelector<HTMLElement>(".sticky-prompt");
          if (bar) stickyHeight.current = bar.offsetHeight;
          const next = promptAbove(el, stickyHeight.current);
          // 同じ発言のままなら前の値を残し、スクロールのたびに描き直さない
          setPinned((prev) => (prev?.id === next?.id ? prev : next));
        }}
      >
        <div className="timeline-inner">
          {hidden > 0 && (
            <button type="button" className="link-button timeline-more" onClick={showMore}>
              以前の発言を表示（あと {hidden} 件）
            </button>
          )}
          <TimelineItems items={items} rel={rel} active={busy} />
          {/* 途中の一部分を描いているときは、最新の分（書いている途中の返答・確認のカード・作業中の行）は出さない（一番下へ戻るボタンで最新へ） */}
          {after > 0 ? (
            <button type="button" className="link-button timeline-more" onClick={() => onShowLater?.()}>
              以降の発言を表示（あと {after} 件）
            </button>
          ) : (
            <>
          {live && (
            <div className="assistant live">
              <Markdown streaming>{live}</Markdown>
            </div>
          )}
          {approvals.map((a) => (
            <ApprovalCard key={a.id} approval={a} />
          ))}
          {/* 返答を書いている間・ツールの実行中も出し続け、送ってからの経過時間を数える */}
          {busy && !waiting && (
            <Working since={run.status === "queued" ? null : run.turn_started_at}>{workingLabel(run, lastItem, live, stopping, runningAgents, connection, background, activity)}</Working>
          )}
          {/* 裏で動いている作業（1 件ずつ止められる） */}
          {busy && <BackgroundTasks runId={run.id} background={background} agents={agents} onOpen={onOpenSubagent} />}
          {/* 通信が切れて止まり、つながるのを待っている */}
          {!busy && connection.reconnect && <ReconnectRow runId={run.id} reconnect={connection.reconnect} />}
            </>
          )}
        </div>
      </div>
      {children}
      {pinned && (
        <StickyPrompt
          text={pinned.text}
          attachments={pinnedAttachments}
          onJump={() => {
            stickToBottom.current = false;
            if (timelineRef.current) jumpToEvent(timelineRef.current, pinned.id);
          }}
        />
      )}
      {/* 一番下へ戻るボタン: いまの状態を添えて出す（答えを待っている・返答が届いたときは目立たせて誘う） */}
      {away && (
        <button
          type="button"
          className={cx("scroll-bottom guide", pill.tone, (pill.tone === "waiting" || pill.tone === "arrived") && "attention")}
          title="一番下までスクロール（⌘↓）"
          aria-label="一番下までスクロール"
          onClick={scrollToBottom}
        >
          {pill.tone === "working" ? (
            <span className="dots" aria-hidden>
              <span />
              <span />
              <span />
            </span>
          ) : (
            <ArrowDown size={14} aria-hidden />
          )}
          <span className="scroll-bottom-label">{pill.label}</span>
          <kbd>⌘↓</kbd>
        </button>
      )}
    </div>
  );
}
