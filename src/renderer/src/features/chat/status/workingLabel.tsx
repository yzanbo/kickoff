import type { ReactNode } from "react";
import { useTicker } from "@/hooks/useTicker";
import type { BackgroundState, Chat, ChatEvent } from "@shared/types";
import type { SubagentEntry } from "@shared/chat/subagents";
import { activityOf, activityText, type Activity } from "./stall";
import { backgroundWaitLabel, countBackground } from "./backgroundLabel";
import { RetryLabel, type Connection } from "./ConnectionStatus";
import type { TimelineItem } from "@/features/chat/timeline/timelineItems";

/** 作業中のチャットの動きの様子（最後に何かが届いてからの時間と、長く動きのないサブエージェント） */
export interface ChatActivity {
  parent: Activity;
  stalled: SubagentEntry[];
}

/** 作業中の行の文（止めている・通信を再試行している・順番待ち・会話を圧縮している・返答を書いている・ツールを実行中・考えている）と、動きの様子 */
export function workingLabel(chat: Chat, last: TimelineItem | undefined, live: string, stopping: boolean, compacting: boolean, runningAgents: number, connection: Connection, background: BackgroundState | null, activity: ChatActivity): ReactNode {
  if (stopping) return "停止中…";
  if (connection.retry) return <RetryLabel retry={connection.retry} agents={Math.max(runningAgents, countBackground(background).agents)} />;
  if (chat.status === "queued") return "順番を待っています";
  // 会話を要約して、コンテキストを空けている（手で圧縮した・上限に近づいて自動で。終わると続きを始める）
  if (compacting) return COMPACTING_LABEL;
  // 長く動きのないサブエージェント（親はその終わりを待っている）。ほかの文より先に知らせる
  if (activity.stalled.length > 0) return <StalledAgentsLabel agents={activity.stalled} />;
  const pendingTool = last?.kind === "tools" ? last.tools[last.tools.length - 1] : undefined;
  const base = (() => {
    if (live) return "返答を書いています";
    if (pendingTool && !pendingTool.result) return "ツールを実行中";
    // 返答を書き終えたあと、裏で動いている作業（サブエージェント・コマンド）の終わりを待っている（Claude Code が知らせる一覧で、種類と名前を出す）
    const waitingBackground = backgroundWaitLabel(background);
    if (waitingBackground) return waitingBackground;
    // 一覧の知らせがない古い Claude Code: 返答を書き終えたあと、裏のサブエージェントの終わりを待っている（指示待ちではない。ここで止めると一緒に止まる）
    if (runningAgents > 0 && last?.kind === "event" && last.event.type === "text") return `裏で動いているサブエージェント ${runningAgents} 件の終わりを待っています`;
    return null;
  })();
  const toolName = pendingTool && !pendingTool.result ? (pendingTool.use.data as { name?: string }).name : undefined;
  const note = activityText(activity.parent, toolName);
  return (
    <>
      {base ?? <ThinkingWords since={lastActivityAt(last) ?? chat.turn_started_at} />}
      {note && <span className={activity.parent.level === "stalled" ? "activity-stalled" : "muted"}> · {note}</span>}
    </>
  );
}

/** 会話を圧縮している間の文（作業中の行・一番下へ戻るボタン・チャット欄のメーター） */
export const COMPACTING_LABEL = "会話を圧縮しています";

/** 長く動きのないサブエージェントを、作業中の行で知らせる（「サブエージェント『調査』が 12 分動いていません（ほか 1 件）」） */
function StalledAgentsLabel({ agents }: { agents: SubagentEntry[] }) {
  const [first] = agents;
  const minutes = activityOf(first.lastActivityAt).minutes;
  return (
    <span className="activity-stalled">
      サブエージェント「{first.description}」が {minutes} 分動いていません{agents.length > 1 ? `（ほか ${agents.length - 1} 件）` : ""}
    </span>
  );
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

/** いちばん新しい作業の終わり（result）のイベント ID（なければ 0） */
export function lastResultIdOf(events: ChatEvent[]): number {
  for (let i = events.length - 1; i >= 0; i--) if (events[i].type === "result") return events[i].id;
  return 0;
}
