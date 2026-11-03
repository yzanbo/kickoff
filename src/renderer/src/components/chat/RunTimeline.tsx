import { useEffect, useRef, type RefObject } from "react";
import type { Approval, Run } from "../../../../core/types";
import { Markdown } from "../Markdown";
import { ApprovalCard } from "./ApprovalCard";
import { TimelineItems, Working } from "./Timeline";
import type { TimelineItem } from "./timelineItems";

/**
 * チャットの発言の流れ（発言とツールのまとまり・生成中の返答・確認のカード・考え中の印）。
 * 一番下を見ているときだけ、新しい発言に合わせてスクロールする（stickToBottom。送ったら親が true に戻す）。
 * focus（検索結果から開いた発言）があれば、そこまでスクロールして一瞬強調する
 */
export function RunTimeline({
  items,
  rel,
  run,
  busy,
  waiting,
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
  live: string;
  approvals: Approval[];
  focus?: number;
  stickToBottom: RefObject<boolean>;
}) {
  const timelineRef = useRef<HTMLDivElement>(null);

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

  return (
    <div
      className="timeline"
      ref={timelineRef}
      onScroll={(e) => {
        const el = e.currentTarget;
        stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
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
        {busy && !waiting && !live && (
          <Working since={run.status === "queued" ? null : run.turn_started_at}>{run.status === "queued" ? "順番を待っています" : "考えています"}</Working>
        )}
      </div>
    </div>
  );
}
