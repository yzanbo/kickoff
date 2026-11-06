// 動き（メインとすべてのサブエージェントの動きを、1 本の時系列に並べる表示）の行の組み立て。純粋な関数
import type { ChatEvent } from "@shared/types";
import { relayedText } from "@shared/chat/prompts";
import type { SubagentEntry } from "@shared/chat/subagents";
import { groupEvents, summarizeTools, type TimelineItem, type ToolCall } from "@/features/chat/timeline/timelineItems";
import { describeTool } from "@/features/chat/tools/toolDescribe";
import { toolSpan } from "@/features/chat/tools/toolTimes";
import { childrenOf, scopeOf, type SubagentTree } from "@/features/chat/subagents/subagentTree";

/** 行の種類（指示・返答・ツールのまとまり・サブエージェントの起動・その終わり・お知らせ・作業の終わり・中の手順が届かないもののいまの動き） */
export type ActivityKind = "prompt" | "reply" | "tools" | "launch" | "end" | "note" | "turn" | "now";

/** 動きの 1 行（時刻・誰が・何を） */
export interface ActivityRow {
  key: string;
  kind: ActivityKind;
  /** 誰の動きか（メインエージェント = null、サブエージェント = 一覧の行のキー） */
  agent: string | null;
  /** 始めた時刻（並べる順） */
  at: string;
  /** かかった時間（ツールのまとまり・サブエージェントの起動から終わりまで・作業の始まりから終わりまで。分からなければ undefined） */
  durationMs?: number;
  /** 1 行の文 */
  text: string;
  /** 会話のその場所へ移るときの記録の ID */
  eventId?: number;
  /** ツールのまとまりの中身（押すと広げる） */
  tools?: ToolCall[];
  /** 起動したサブエージェント（launch。一覧の行のキー） */
  child?: string;
  /** 実行中（結果の届いていないツール） */
  running?: boolean;
  /** 失敗・エラー */
  failed?: boolean;
}

/**
 * 動きの行が指すサブエージェントと、その中の記録（押したときに開くもの）。起動の行は起動した子（その画面・カードの初めから）、
 * 終わり・いまの行はそのサブエージェント、サブエージェントの中の行はその記録（eventId を渡せば、まとめたツールのうちのその 1 回）。
 * メインの行は null（会話のその場所へ移るだけ）
 */
export function agentTargetOf(row: ActivityRow, eventId = row.eventId): { key: string; eventId?: number } | null {
  if (row.kind === "launch" && row.child) return { key: row.child };
  if ((row.kind === "end" || row.kind === "now") && row.agent !== null) return { key: row.agent };
  return row.agent === null ? null : { key: row.agent, eventId };
}

/** 絞り込み（すべて・メインだけ・そのサブエージェントと配下） */
export type ActivityFilter = { kind: "all" } | { kind: "main" } | { kind: "agent"; key: string };

const firstLine = (text: string): string => text.split("\n").find((line) => line.trim())?.trim() ?? "";
const elapsed = (from: string | undefined, to: string | undefined): number | undefined =>
  from && to ? Math.max(0, Date.parse(to) - Date.parse(from)) : undefined;

/**
 * メインとすべてのサブエージェントの記録を、時刻の順に 1 本に並べた行にする。それぞれの流れは会話と同じまとめ方（groupEvents）で、
 * 続けてのツールは 1 行（押すと広げる）、自分の指示・返答は 1 行目だけ。サブエージェントは起動の行（起動した側）から始まり、
 * 終わりの行（報告・失敗・中断）で終わる。busy: メインが作業中か（結果の届いていないツールを実行中として見せる）
 */
export function activityRows(events: ChatEvent[], tree: SubagentTree, busy: boolean): ActivityRow[] {
  const rows: ActivityRow[] = [];
  // メインの最後の作業の終わり（それより前の結果のない呼び出しは、中断したもので実行中ではない）
  const lastResult = events.findLast((e) => e.type === "result");
  const mainFloor = lastResult ? Date.parse(lastResult.created_at) : -Infinity;
  const relays = [...tree.byKey.values()].filter((s) => s.agentId !== undefined);
  const name = (key: string | undefined) => (key === undefined ? "メインエージェント" : (tree.byKey.get(key)?.description ?? "サブエージェント"));

  const push = (items: TimelineItem[], owner: SubagentEntry | undefined) => {
    const agent = owner?.key ?? null;
    for (const item of items) {
      const row = rowOf(item, agent, owner, { busy, mainFloor, relays, tree });
      if (row) rows.push(row);
    }
  };
  push(groupEvents(events), undefined);
  // サブエージェントは親のあとに（同じ時刻なら、起動の行が先に来るように）
  const walk = (parent: string | undefined, depth: number) => {
    for (const entry of childrenOf(tree, parent)) {
      const items = groupEvents(events, scopeOf(entry));
      push(items, entry);
      if (entry.status === "running" && items.length === 0 && entry.lastTool && entry.lastActivityAt) {
        // 中の手順が届かない（孫より深い）実行中のもの: 途中経過の最後のツールを、いまの動きとして 1 行
        rows.push({ key: `now-${entry.key}`, kind: "now", agent: entry.key, at: entry.lastActivityAt, text: `いま: ${entry.lastTool}`, running: true });
      }
      if (entry.status !== "running" && entry.endedAt) {
        const failed = entry.status === "failed";
        rows.push({
          key: `end-${entry.key}`,
          kind: "end",
          agent: entry.key,
          at: entry.endedAt,
          durationMs: entry.durationMs ?? elapsed(entry.startedAt, entry.endedAt),
          text: entry.status === "completed" ? `報告 → ${name(entry.parentKey)}` : failed ? `失敗${entry.network ? "（通信の切断）" : ""}` : "中断",
          failed,
          ...(entry.endEventId !== undefined ? { eventId: entry.endEventId } : {}),
        });
      }
      if (depth < 32) walk(entry.key, depth + 1);
    }
  };
  walk(undefined, 0);
  // 時刻の順（同じ時刻なら入れた順のまま。Array.prototype.sort は安定）
  return rows.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

interface RowContext {
  busy: boolean;
  mainFloor: number;
  relays: SubagentEntry[];
  tree: SubagentTree;
}

/** 流れの項目 1 つを、動きの 1 行にする（考えた行・裏のサブエージェントの終わりの 1 行など、出さないものは null） */
function rowOf(item: TimelineItem, agent: string | null, owner: SubagentEntry | undefined, ctx: RowContext): ActivityRow | null {
  if (item.kind === "tools") {
    const { tools } = item;
    const span = toolSpan(tools);
    const pending = tools.some((t) => !t.result);
    const running = pending && (owner ? owner.status === "running" : ctx.busy && Date.parse(span.latestStart) > ctx.mainFloor);
    const first = tools[0].use.data;
    return {
      key: item.key,
      kind: "tools",
      agent,
      at: span.start,
      durationMs: pending ? undefined : elapsed(span.start, span.end),
      // 1 件ならそのツールの中身（「コマンド: npm test」）、いくつもならまとめ（「2個のファイルを読み取り および 1回検索」）
      text: tools.length === 1 ? describeTool(first.name, (first.input ?? {}) as Record<string, unknown>) : summarizeTools(tools),
      eventId: tools[0].use.id,
      tools,
      ...(running ? { running } : {}),
      ...(tools.some((t) => t.result?.data.is_error) ? { failed: true } : {}),
    };
  }
  if (item.kind === "subagent") {
    const child = ctx.tree.byKey.get(item.call.use.data.id);
    const input = (item.call.use.data.input ?? {}) as { description?: string };
    return {
      key: item.key,
      kind: "launch",
      agent,
      at: item.call.use.created_at,
      text: `サブエージェント「${child?.description ?? input.description ?? "サブエージェント"}」を起動`,
      eventId: item.call.use.id,
      child: item.call.use.data.id,
    };
  }
  if (item.kind === "subagentEnd") return null;
  const e = item.event;
  const base = { key: item.key, agent, at: e.created_at, eventId: e.id };
  switch (e.type) {
    case "user": {
      // チャット欄から伝えたサブエージェントへの指示は、宛先を添える
      for (const s of ctx.relays) {
        const inner = relayedText(e.data.text, s.agentId!);
        if (inner !== undefined) return { ...base, kind: "prompt", text: `伝える → ${s.description}「${firstLine(inner)}」` };
      }
      return { ...base, kind: "prompt", text: `指示「${firstLine(e.data.text)}」` };
    }
    case "text":
      return { ...base, kind: "reply", text: `${agent === null ? "返答" : "発言"}「${firstLine(e.data.text)}」` };
    case "result": {
      const status = e.data.status;
      return {
        ...base,
        kind: "turn",
        text: status === "cancelled" ? "作業を中断" : status === "failed" ? "作業が失敗" : "作業の終わり",
        durationMs: elapsed(item.turnStart, e.created_at),
        ...(status === "failed" ? { failed: true } : {}),
      };
    }
    case "compact":
      return { ...base, kind: "note", text: `会話を要約しました（${e.data.trigger === "auto" ? "自動" : "手動"}）` };
    case "context_cleared":
      return { ...base, kind: "note", text: "コンテキストを消去（ここから新しい会話）" };
    case "notice":
      return { ...base, kind: "note", text: firstLine(e.data.message) };
    case "error":
      return { ...base, kind: "note", text: firstLine(e.data.message), failed: true };
    default:
      return null;
  }
}

/** そのサブエージェントと、その中で起動したもの（入れ子ごと）のキー */
export function agentScope(tree: SubagentTree, key: string): Set<string> {
  const keys = new Set<string>();
  const collect = (k: string, depth: number) => {
    keys.add(k);
    if (depth < 32) for (const child of childrenOf(tree, k)) collect(child.key, depth + 1);
  };
  collect(key, 0);
  return keys;
}

/** 絞り込んだ行（メインだけ = メインの行、サブエージェント = そのサブエージェントと配下の行。その起動の行は外し、自分の線から始める） */
export function filterActivity(rows: ActivityRow[], tree: SubagentTree, filter: ActivityFilter): ActivityRow[] {
  if (filter.kind === "all") return rows;
  if (filter.kind === "main") return rows.filter((r) => r.agent === null);
  const keys = agentScope(tree, filter.key);
  return rows.filter((r) => r.agent !== null && keys.has(r.agent));
}

/** そのサブエージェント（agentScope）の行の位置（その起動の行も含む。「動きで見る」で強調して順に移る） */
export function focusedRowIndexes(rows: readonly ActivityRow[], scope: ReadonlySet<string>): number[] {
  const hits: number[] = [];
  rows.forEach((r, i) => {
    if ((r.agent !== null && scope.has(r.agent)) || (r.child !== undefined && scope.has(r.child))) hits.push(i);
  });
  return hits;
}
