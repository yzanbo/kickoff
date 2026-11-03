import { ArrowDown } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { cx } from "../../cx";
import { RUN_STATUS_LABELS } from "../RunStatus";
import { useTicker } from "../../hooks/useTicker";
import { useWindowEvent } from "../../hooks/useWindowEvent";
import type { Approval, Run } from "../../../../core/types";
import { Markdown } from "../Markdown";
import { ApprovalCard } from "./ApprovalCard";
import { jumpToEvent } from "./jumpToEvent";
import { StickyPrompt } from "./StickyPrompt";
import { TimelineItems, Working } from "./Timeline";
import type { TimelineItem } from "./timelineItems";

/**
 * 画面の上に流れて見えなくなった、いちばん下の自分の発言（その返答を読んでいる）。
 * どれも流れていなければ undefined
 */
function promptAbove(timeline: HTMLElement): { id: number; text: string } | undefined {
  const top = timeline.getBoundingClientRect().top;
  // 上端より上から始まる、いちばん下の吹き出し（それがまだ少しでも見えていれば、貼り付けない）
  let found: HTMLElement | undefined;
  for (const bubble of timeline.querySelectorAll<HTMLElement>(".bubble.user")) {
    if (bubble.getBoundingClientRect().top >= top) break;
    found = bubble;
  }
  if (found && found.getBoundingClientRect().bottom > top) return undefined;
  const id = found ? Number(found.id.replace("ev-", "")) : NaN;
  if (!found || !Number.isFinite(id)) return undefined;
  const text = found.querySelector(".bubble-text")?.textContent?.trim() ?? "";
  return text ? { id, text } : undefined;
}

/** いちばん新しい作業の終わり（result）のイベント ID（なければ 0） */
function lastResultIdOf(items: TimelineItem[]): number {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.kind === "event" && item.event.type === "result") return item.event.id;
  }
  return 0;
}

/** 一番下を見ているとみなす、下端からの距離（これより上にスクロールしたら、新しい発言に付いていかない） */
const BOTTOM_SLACK_PX = 80;

/** 作業中の行の文（止めている・順番待ち・返答を書いている・ツールを実行中・考えている） */
function workingLabel(run: Run, items: TimelineItem[], live: string, stopping: boolean, runningAgents: number): ReactNode {
  if (stopping) return "停止中…";
  if (run.status === "queued") return "順番を待っています";
  if (live) return "返答を書いています";
  const last = items[items.length - 1];
  if (last?.kind === "tools" && !last.tools[last.tools.length - 1].result) return "ツールを実行中";
  // 返答を書き終えたあと、裏のサブエージェントの終わりを待っている（指示待ちではない。ここで止めると一緒に止まる）
  if (runningAgents > 0 && last?.kind === "event" && last.event.type === "text") return `裏で動いているサブエージェント ${runningAgents} 件の終わりを待っています`;
  return <ThinkingWords since={lastActivityAt(last) ?? run.turn_started_at} />;
}

/** いちばん最後に動いた時刻（最後の発言・ツールの結果）。考え始めた時刻として使う */
function lastActivityAt(item: TimelineItem | undefined): string | null {
  if (!item) return null;
  if (item.kind === "event") return item.event.created_at;
  const call = item.tools[item.tools.length - 1];
  return (call.result ?? call.use).created_at;
}

/** 考えている間の文を、考え始めてからの時間で変える（長く考えていることが分かるように） */
const THINKING_WORDS: [number, string][] = [
  [60_000, "じっくり考えています"],
  [20_000, "まだ考えています"],
  [0, "考えています"],
];

function ThinkingWords({ since }: { since: string | null }) {
  useTicker(1000);
  const ms = since ? Date.now() - new Date(since).getTime() : 0;
  return <>{THINKING_WORDS.find(([after]) => ms >= after)![1]}</>;
}

/**
 * チャットの発言の流れ（発言とツールのまとまり・生成中の返答・確認のカード・作業中の行）。
 * 一番下を見ているときだけ、新しい発言に合わせてスクロールする（stickToBottom。送ったら親が true に戻す）。
 * 上にスクロールしている間は、一番下へ戻るボタンを出す（⌘↓ でも戻る）。答えを待っているとき・その間に作業が終わったときは、
 * ボタンに文を添えて目立たせ、下へ戻るよう誘う。
 * focus（検索結果から開いた発言）があれば、そこまでスクロールして一瞬強調する
 */
export function RunTimeline({
  items,
  rel,
  run,
  busy,
  runningAgents = 0,
  waiting,
  stopping,
  live,
  approvals,
  focus,
  stickToBottom,
}: {
  items: TimelineItem[];
  rel: (s: string) => string;
  run: Run;
  busy: boolean;
  /** 裏で動いているサブエージェントの数（返答を書き終えたあとも作業中のときに、その終わりを待っていると出す） */
  runningAgents?: number;
  waiting: boolean;
  /** 停止を押して、止まるのを待っている */
  stopping: boolean;
  live: string;
  approvals: Approval[];
  focus?: number;
  stickToBottom: RefObject<boolean>;
}) {
  const timelineRef = useRef<HTMLDivElement>(null);
  // 一番下から離れているか（一番下へ戻るボタンを出す）
  const [away, setAway] = useState(false);
  // 上を読んでいる間に作業が終わったか（一番下へ戻るボタンで知らせる。一番下へ戻ったら消す）
  const lastResultId = lastResultIdOf(items);
  const awayFromResult = useRef<number | null>(null);
  if (!away) awayFromResult.current = null;
  else awayFromResult.current ??= lastResultId;
  const finishedWhileAway = away && awayFromResult.current !== null && lastResultId > awayFromResult.current;
  // 上に貼り付けておく自分の発言（読んでいる返答の元の発言）
  const [pinned, setPinned] = useState<{ id: number; text: string }>();

  // 検索結果から開いたときは、その発言までスクロールして一瞬強調する
  useEffect(() => {
    if (!focus) return;
    if (!timelineRef.current || !jumpToEvent(timelineRef.current, focus)) return;
    stickToBottom.current = false;
  }, [focus, items.length, stickToBottom]);

  // 一番下を見ているときだけ、新しい発言に合わせてスクロールする
  useEffect(() => {
    const el = timelineRef.current;
    if (el && stickToBottom.current && !focus) el.scrollTop = el.scrollHeight;
  }, [items.length, approvals.length, live, focus, stickToBottom]);

  function scrollToBottom() {
    const el = timelineRef.current;
    if (!el) return;
    stickToBottom.current = true;
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
  const pill: { label: ReactNode; tone: "waiting" | "arrived" | "working" | "idle" | "failed" } = waiting
    ? { label: "回答を待っています", tone: "waiting" }
    : finishedWhileAway
      ? { label: run.status === "failed" ? "失敗しました" : "返答が届きました", tone: run.status === "failed" ? "failed" : "arrived" }
      : busy
        ? { label: workingLabel(run, items, live, stopping, runningAgents), tone: "working" }
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
          const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_SLACK_PX;
          stickToBottom.current = atBottom;
          setAway(!atBottom);
          const next = promptAbove(el);
          // 同じ発言のままなら前の値を残し、スクロールのたびに描き直さない
          setPinned((prev) => (prev?.id === next?.id ? prev : next));
        }}
      >
        <div className="timeline-inner">
          <TimelineItems items={items} rel={rel} active={busy} />
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
            <Working since={run.status === "queued" ? null : run.turn_started_at}>{workingLabel(run, items, live, stopping, runningAgents)}</Working>
          )}
        </div>
      </div>
      {pinned && (
        <StickyPrompt
          text={pinned.text}
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
