import { ArrowDown } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useTicker } from "../../hooks/useTicker";
import type { Approval, Run } from "../../../../core/types";
import { IconButton } from "../IconButton";
import { Markdown } from "../Markdown";
import { ApprovalCard } from "./ApprovalCard";
import { TimelineItems, Working } from "./Timeline";
import type { TimelineItem } from "./timelineItems";

/** 一番下を見ているとみなす、下端からの距離（これより上にスクロールしたら、新しい発言に付いていかない） */
const BOTTOM_SLACK_PX = 80;

/** 作業中の行の文（止めている・順番待ち・返答を書いている・ツールを実行中・考えている） */
function workingLabel(run: Run, items: TimelineItem[], live: string, stopping: boolean): ReactNode {
  if (stopping) return "停止中…";
  if (run.status === "queued") return "順番を待っています";
  if (live) return "返答を書いています";
  const last = items[items.length - 1];
  if (last?.kind === "tools" && !last.tools[last.tools.length - 1].result) return "ツールを実行中";
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
 * 上にスクロールしている間は、一番下へ戻るボタンを出す。
 * focus（検索結果から開いた発言）があれば、そこまでスクロールして一瞬強調する
 */
export function RunTimeline({
  items,
  rel,
  run,
  busy,
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

  // 検索結果から開いたときは、その発言までスクロールして一瞬強調する
  useEffect(() => {
    if (!focus) return;
    const target = document.getElementById(`ev-${focus}`);
    if (!target) return;
    stickToBottom.current = false;
    target.scrollIntoView({ block: "center" });
    target.classList.remove("flash");
    void target.offsetWidth; // アニメーションをやり直すため
    target.classList.add("flash");
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

  return (
    <div className="timeline-wrap">
      <div
        className="timeline"
        ref={timelineRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_SLACK_PX;
          stickToBottom.current = atBottom;
          setAway(!atBottom);
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
            <Working since={run.status === "queued" ? null : run.turn_started_at}>{workingLabel(run, items, live, stopping)}</Working>
          )}
        </div>
      </div>
      {away && (
        <IconButton icon={ArrowDown} label="一番下までスクロール" size={15} type="button" className="scroll-bottom" onClick={scrollToBottom} />
      )}
    </div>
  );
}
