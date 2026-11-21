// 筋書きの「外から見えるもの」を作って比べる: AI に送った指示の名前の付け方（定型文 → 前:・後:・[再開]…）・記録・送信待ち・作業中の様子。テストからだけ使う
import assert from "node:assert/strict";
import type { ChatDetail } from "@shared/chat/detail";
import type { QueuedMessage } from "@shared/chat/types";
import type { ChatEvent } from "@shared/chat/chatEvent";
import type { RestartResume } from "@shared/chat/chatLive";
import { autoPreCompactMessage, busyPreCompactMessage, manualPreCompactMessage, postCompactMessage, RESTART_RESUME_PROMPT, RESUME_PROMPT, USAGE_RESUME_PROMPT } from "@shared/chat/prompts";
import type { AgentProvider } from "@/features/ai/core/index";
import type { ChatAlias, LiveExpect, ScenarioExpect } from "./types";

/** 定型文に入れた設定の文（圧縮前指示・圧縮後指示。途中で変えたものも覚える） */
export interface PromptTexts {
  pre: Set<string>;
  post: Set<string>;
}

/** 再開の指示に添えたサブエージェントの ID（「[再開:a1]」の形に） */
function withAgents(head: string, prompt: string): string {
  const ids = [...prompt.matchAll(/（ID: ([^）]+)）/g)].map((m) => m[1]);
  return ids.length > 0 ? `${head.slice(0, -1)}:${ids.join(",")}]` : head;
}

/** AI に送った指示・足した発言の名前（定型文は札に置き換える） */
export function promptLabel(prompt: string, texts: PromptTexts): string {
  if (prompt === "/compact") return prompt;
  for (const t of texts.pre) if (prompt === manualPreCompactMessage(t) || prompt === busyPreCompactMessage(t)) return `前:${t}`;
  for (const t of texts.post) if (prompt === postCompactMessage(t)) return `後:${t}`;
  if (prompt.startsWith(RESUME_PROMPT)) return withAgents("[再開]", prompt);
  if (prompt.startsWith(RESTART_RESUME_PROMPT)) return withAgents("[起動の再開]", prompt);
  if (prompt === USAGE_RESUME_PROMPT) return "[枠の再開]";
  return prompt;
}

/** 自動の圧縮の前の指示の名前 */
export function preCompactLabel(pre: Parameters<AgentProvider["run"]>[0]["preCompact"], texts: PromptTexts): string | null {
  if (!pre) return null;
  for (const t of texts.pre) if (pre.message === autoPreCompactMessage(t)) return `自動前:${t}`;
  return pre.message;
}

/** 発言の印の札 */
function marksLabel(m: { handoff_request?: true; handoff_from?: { chat_id: number } | null; workplace_continuation?: true }): string {
  return `${m.handoff_request ? "#依頼" : ""}${m.handoff_from ? `#from${m.handoff_from.chat_id}` : ""}${m.workplace_continuation ? "#続き" : ""}`;
}

/** 送信待ち・預かりの行の名前（圧縮・消去の行は [圧縮]・[消去]、圧縮後指示は 後:） */
export function rowLabel(m: QueuedMessage): string {
  if (m.compact) return "[圧縮]";
  if (m.clear) return "[消去]";
  return `${m.post_compact ? "後:" : ""}${m.text}${marksLabel(m)}`;
}

/** 記録の自分の発言の名前（再開の定型文は札に置き換える） */
function userLabel(e: ChatEvent, texts: PromptTexts): string[] {
  if (e.type !== "user") return [];
  return [`${e.data.pre_compact ? "前:" : e.data.post_compact ? "後:" : ""}${promptLabel(e.data.text, texts)}${marksLabel(e.data)}`];
}

/** 外から見たもの（筋書きの 1 つのチャットと、全体） */
export interface Observed {
  detail: ChatDetail;
  texts: PromptTexts;
  runs: string[];
  told: string[];
  preCompacts: (string | null)[];
  sessions: (string | null)[];
  concurrent: number;
  busy: boolean;
  answers: string[];
  /** 起動したときの再開の確かめ（読むと中身が変わりうるので、比べるときだけ読む） */
  restartResumes?: RestartResume[];
  /** 圧縮を始めた時刻の呼び名（出てきた順に t1・t2…） */
  sinceAlias: (since: string) => string;
  aliasOf: (chatId: number) => ChatAlias;
}

/** 比べる欄だけを作る（書いていない欄は作らない） */
export function actual(want: ScenarioExpect, o: Observed): Partial<Record<keyof ScenarioExpect, unknown>> {
  const { detail } = o;
  const { chat, live, events } = detail;
  const pick: Record<string, () => unknown> = {
    runs: () => o.runs,
    told: () => o.told,
    preCompacts: () => o.preCompacts,
    sessions: () => o.sessions,
    concurrent: () => o.concurrent,
    users: () => events.flatMap((e) => userLabel(e, o.texts)),
    events: () => events.map((e) => e.type),
    notices: () => events.flatMap((e) => (e.type === "notice" ? [e.data.message] : [])),
    errors: () => events.flatMap((e) => (e.type === "error" ? [e.data.message] : [])),
    compacts: () => events.flatMap((e) => (e.type === "compact" ? [e.data.trigger] : [])),
    queue: () => live.queue.messages.map(rowLabel),
    stops: () => live.queue.stops,
    paused: () => live.queue.paused,
    waitingEdit: () => live.queue.waiting_edit,
    held: () => live.after_compact.map(rowLabel),
    live: () => liveOf(want.live ?? {}, detail, o.sinceAlias),
    status: () => chat.status,
    unread: () => chat.unread,
    session: () => chat.session_id,
    turns: () => chat.num_turns,
    worktree: () => (chat.worktree_path ? chat.worktree_path.split("/").at(-1) : null),
    busy: () => o.busy,
    asks: () => detail.approvals.map((a) => a.kind),
    answers: () => o.answers,
    restartResumes: () => (o.restartResumes ?? []).map((r) => ({ chat: o.aliasOf(r.chat_id), interrupted: r.interrupted, queued: r.queued, messages: r.messages.map(rowLabel) })),
  };
  return Object.fromEntries(Object.keys(want).flatMap((key) => (key === "chat" ? [] : [[key, pick[key]()]])));
}

/** 作業中の様子のうち、書いた欄だけ */
function liveOf(want: LiveExpect, detail: ChatDetail, sinceAlias: (since: string) => string): LiveExpect {
  const { live } = detail;
  const all: Required<LiveExpect> = {
    tells_closed: live.tells_closed,
    awaiting_compact: live.awaiting_compact,
    compact_after_turn: live.compact_after_turn,
    compacted_turn: live.compacted_turn,
    compacting: live.compacting && { trigger: live.compacting.trigger, since: sinceAlias(live.compacting.since) },
    stopping: live.stopping,
    restart_resume: live.restart_resume,
    reconnect: live.reconnect && { attempts: live.reconnect.attempts, agents: live.reconnect.agents },
    workplace_move: live.workplace_move !== null,
  };
  return Object.fromEntries(Object.keys(want).map((key) => [key, all[key as keyof LiveExpect]]));
}

/** 書いた欄が合っているか（お知らせ・失敗は書いた文を含むか） */
export function matches(want: ScenarioExpect, got: Partial<Record<keyof ScenarioExpect, unknown>>): boolean {
  try {
    assertMatches(want, got);
    return true;
  } catch {
    return false;
  }
}

export function assertMatches(want: ScenarioExpect, got: Partial<Record<keyof ScenarioExpect, unknown>>) {
  const { chat: _chat, notices, errors, ...rest } = want;
  const contains = (key: "notices" | "errors", texts: string[] | undefined) => {
    if (!texts) return;
    const list = got[key] as string[];
    assert.equal(list.length, texts.length, `${key}: ${JSON.stringify(list)}`);
    texts.forEach((t, i) => assert.ok(list[i].includes(t), `${key}[${i}]: ${list[i]} に「${t}」がない`));
  };
  contains("notices", notices);
  contains("errors", errors);
  const keys = Object.keys(rest) as (keyof typeof rest)[];
  assert.deepEqual(Object.fromEntries(keys.map((k) => [k, got[k]])), rest);
}
