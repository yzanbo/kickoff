import { isBackgroundLaunch } from "./backgroundTasks.js";
import { isNetworkError } from "./networkErrors.js";
import type { RunEvent, SubagentInfo } from "./types.js";

// サブエージェントの一覧の組み立て（画面の一覧・タブと、コアの作業の終わりのお知らせ・通信が戻ったときの再開で共有する。Node 依存なし）

/** 一覧の 1 行（Task / Agent ツールの呼び出しと、SDK のサブエージェントの通知をまとめたもの） */
export interface SubagentEntry {
  key: string;
  description: string;
  subagentType?: string;
  /** Task ツールで指定されたモデル（なければ親と同じ） */
  model?: string;
  status: SubagentInfo["status"];
  tokens?: number;
  toolUses?: number;
  durationMs?: number;
  lastTool?: string;
  /** タイムラインで、この呼び出しを含むツールのまとまりへ移るための ID */
  toolUseEventId?: number;
  /** Claude Code のサブエージェントの ID（作業 ID と同じ。SendMessage で続きを頼むときの宛先） */
  agentId?: string;
  /** いちばん新しい親への報告（終わりの知らせの要約。再開したら、その回の報告に置き換わる） */
  summary?: string;
  /** 親のエージェントからの依頼（やり直すときに同じ依頼を渡す） */
  prompt?: string;
  /** 通信の切断で止まった（失敗・中断のときだけ。API のエラーで終わった・通信で親ごと終わったときに動いていた） */
  network?: boolean;
  /** いちばん新しい回が始まった記録の ID（起動の呼び出し・再開の知らせ） */
  startEventId?: number;
  /** 止まった記録の ID（終わりの知らせ・ツールの結果・通信で親が失敗した結果。分からなければ undefined） */
  endEventId?: number;
  /** 最後に動いた時刻（サブエージェントの発言・ツール・知らせ。画面に届く途中経過は画面の側で足す） */
  lastActivityAt?: string;
  /** 結果を待っているツール（呼んで、まだ結果が届いていない。長いコマンドを実行中など） */
  pendingTool?: string;
}

/** Agent / Task ツールの結果の文から、サブエージェントの ID を取り出す（以前の記録で、作業 ID の知らせが残っていないとき） */
const agentIdIn = (content: unknown): string | undefined =>
  typeof content === "string" ? /agentId:\s*([a-z0-9]+)/.exec(content)?.[1] : undefined;

const SUBAGENT_TOOLS = new Set(["Task", "Agent"]);

/** サブエージェントを起動するツール（Task / Agent）か */
export function isSubagentTool(name: string): boolean {
  return SUBAGENT_TOOLS.has(name);
}

/**
 * チャットのサブエージェントの一覧を組み立てる。保存されたイベント（Task / Agent の呼び出しと結果、開始・終了の通知）と、
 * 画面にだけ届く途中経過（progress: トークン数・直近のツール）を合わせる。busy でなければ、終わっていないものは中断とみなす
 */
export function collectSubagents(events: RunEvent[], progress: Record<string, SubagentInfo>, busy: boolean, live?: Set<string>): SubagentEntry[] {
  const map = new Map<string, SubagentEntry>();
  // 裏で動かした（起動の知らせ・再開）サブエージェントと、いちばん新しく始まったあとに報告（SubagentHandback）を渡したか
  const backgrounded = new Set<string>();
  const handedBack = new Set<string>();
  // サブエージェントでないツール（Bash など）の呼び出し。以前の記録には、裏で動かしたコマンドのタスクも subagent として残っているので除く
  const otherTools = new Set<string>();
  // 作業 ID → 行のキー（起動した Agent / Task の呼び出し ID）。SendMessage で再開すると、作業 ID はそのままで、
  // 知らせの呼び出し ID は再開を頼んだ SendMessage のものになるので、作業 ID で元の行にまとめる
  const taskToKey = new Map<string, string>();
  // 通信の切断で止まったもの（行のキー）
  const network = new Set<string>();
  const markNetwork = (key: string, yes: boolean) => (yes ? network.add(key) : network.delete(key));
  // サブエージェントの中の動き（parent = 起動した呼び出し ID）: 最後に動いた時刻と、結果を待っているツール
  const touch = (e: RunEvent) => {
    const d = e.data as { parent?: string; name?: string };
    const entry = d.parent ? map.get(d.parent) : undefined;
    if (!entry) return;
    entry.lastActivityAt = e.created_at;
    entry.pendingTool = e.type === "tool_use" ? d.name : undefined;
  };
  for (const e of events) {
    if (e.type === "text" || e.type === "thinking" || e.type === "tool_result") touch(e);
    if (e.type === "tool_use") {
      const d = e.data as { id: string; name: string; input?: { description?: string; subagent_type?: string; model?: string; prompt?: string } };
      if (!isSubagentTool(d.name)) {
        touch(e);
        // サブエージェントが報告を渡した（終わりの知らせを取りこぼしても、終わったと分かる）
        const parent = (e.data as { parent?: string }).parent;
        if (d.name === "SubagentHandback" && parent) handedBack.add(parent);
        otherTools.add(d.id);
        continue;
      }
      map.set(d.id, {
        key: d.id,
        description: d.input?.description ?? "サブエージェント",
        subagentType: d.input?.subagent_type,
        model: d.input?.model,
        prompt: d.input?.prompt,
        status: "running",
        toolUseEventId: e.id,
        startEventId: e.id,
        lastActivityAt: e.created_at,
      });
    } else if (e.type === "tool_result") {
      const d = e.data as { tool_use_id: string; is_error: boolean; content?: unknown };
      const entry = map.get(d.tool_use_id);
      if (!entry) continue;
      entry.agentId ??= agentIdIn(d.content);
      // 裏で動かしたサブエージェントは、結果が「起動した」という知らせなので、まだ終わっていない（終わりは通知で届く）
      if (isBackgroundLaunch(d.content)) backgrounded.add(entry.key);
      else {
        entry.status = d.is_error ? "failed" : "completed";
        entry.endEventId = e.id;
        markNetwork(entry.key, d.is_error && typeof d.content === "string" && isNetworkError(d.content));
      }
    } else if (e.type === "subagent") {
      const d = e.data as unknown as SubagentInfo;
      const own = d.tool_use_id ?? d.task_id;
      const key = taskToKey.get(d.task_id) ?? own;
      if (!map.has(key) && otherTools.has(key)) continue;
      if (map.has(key) || !otherTools.has(own)) taskToKey.set(d.task_id, key);
      // 再開した回の知らせ（呼び出し ID が元の行と違う）は、完了のあとでも作業中に戻す
      const resumed = d.tool_use_id !== undefined && d.tool_use_id !== key;
      if (d.status === "running") {
        // 再開は必ず裏で動く。始まり直したので、前の回の報告と止まった理由は数えない
        if (resumed) {
          backgrounded.add(key);
          network.delete(key);
        }
        handedBack.delete(key);
      } else {
        // API のエラー（通信の切断）で終わった: Claude Code の知らせの要約に、そのエラーの文が入る
        markNetwork(key, d.status === "failed" && isNetworkError(d.summary));
      }
      const entry = map.get(key) ?? { key, description: d.description || "サブエージェント", status: d.status };
      // 再開した回は、ここから始まり直す
      const restarted = d.status === "running" && resumed;
      map.set(key, {
        ...entry,
        startEventId: restarted ? e.id : (entry.startEventId ?? e.id),
        endEventId: d.status === "running" ? (restarted ? undefined : entry.endEventId) : e.id,
        lastActivityAt: e.created_at,
        pendingTool: restarted ? undefined : entry.pendingTool,
        description: entry.description || d.description,
        subagentType: entry.subagentType ?? d.subagent_type,
        status: resumed || !(d.status === "running" && entry.status !== "running") ? d.status : entry.status,
        tokens: d.tokens ?? entry.tokens,
        toolUses: d.tool_uses ?? entry.toolUses,
        durationMs: d.duration_ms ?? entry.durationMs,
        agentId: d.task_id || entry.agentId,
        summary: d.summary ?? entry.summary,
      });
    } else if (e.type === "result") {
      // 実行の終わり。通信の切断で失敗したら、そのとき動いていたものは通信で止まった。
      // それ以外の終わり方（自分で止めた・最後まで終わった）なら、動いていたものの通信の印は外す
      const d = e.data as { status?: string; text?: string; network?: boolean };
      const byNetwork = d.status === "failed" && (d.network === true || isNetworkError(d.text));
      for (const entry of map.values()) {
        if (entry.status !== "running") continue;
        markNetwork(entry.key, byNetwork);
        if (byNetwork) entry.endEventId = e.id;
      }
    }
  }
  for (const p of Object.values(progress)) {
    const entry = map.get(taskToKey.get(p.task_id) ?? p.tool_use_id ?? p.task_id);
    if (!entry || entry.status !== "running") continue;
    map.set(entry.key, { ...entry, tokens: p.tokens ?? entry.tokens, toolUses: p.tool_uses ?? entry.toolUses, lastTool: p.last_tool });
  }
  // 動いていないのに終わっていないもの: Claude Code が終わった、または裏で動いているものの一覧から消えた（終わりの知らせを取りこぼした）。
  // 報告を渡していれば完了、なければ中断とみなす（一覧は裏で動かしたものだけなので、待つ形のものには使わない）
  return [...map.values()].map((s) => {
    const settled: SubagentEntry =
      s.status === "running" &&
      (!busy || (live !== undefined && backgrounded.has(s.key) && s.agentId !== undefined && !live.has(s.agentId)))
        ? { ...s, status: handedBack.has(s.key) ? "completed" : "stopped" }
        : s;
    return settled.status === "failed" || settled.status === "stopped" ? { ...settled, network: network.has(s.key) } : settled;
  });
}

/**
 * 1 回の実行（記録の ID が sinceEventId より後）で始めたのに、終わりの知らせがないまま実行が終わったサブエージェント。
 * Kickoff では実行の終わりで Claude Code のプロセスも終わるので、これらはそこで止まる（作業の終わりにお知らせを残す）
 */
export function unfinishedSubagents(events: RunEvent[], sinceEventId: number): SubagentEntry[] {
  // 実行が終わったとして数え、終わりの記録がないまま中断になったもの（報告を渡したものは完了になる）
  return collectSubagents(events, {}, false).filter(
    (s) => s.status === "stopped" && s.endEventId === undefined && (s.startEventId ?? 0) > sinceEventId,
  );
}

/**
 * 1 回の実行（記録の ID が sinceEventId より後）で、通信の切断で止まったサブエージェント（作業 ID が分かるものだけ）。
 * 通信が戻って自動で再開するときに、SendMessage で続きから再開するよう頼む。自分で止めたもの・ほかの理由の失敗は含めない
 */
export function networkStoppedSubagents(events: RunEvent[], sinceEventId: number): SubagentEntry[] {
  return collectSubagents(events, {}, false).filter(
    (s) => s.network && s.agentId !== undefined && (s.endEventId ?? Number.POSITIVE_INFINITY) > sinceEventId,
  );
}

/**
 * Task / Agent ツールの結果から、サブエージェントの報告の本文だけを取り出す。
 * 結果には Claude Code が付ける前置き（使ったツールの一覧や「The report follows:」までの注意書き）と、行頭の字下げが入っている
 */
export function cleanSubagentReport(text: string): string {
  const marker = "The report follows:";
  const at = text.indexOf(marker);
  const body = at >= 0 ? text.slice(at + marker.length) : text.replace(/<tools-used-before-summary>[\s\S]*?<\/tools-used-before-summary>/g, "");
  return body
    .split("\n")
    .map((line) => line.replace(/^ {2}/, ""))
    .join("\n")
    .trim();
}

/** 終わりの知らせの要約が、報告そのものでなく「報告は別の知らせ（SubagentHandback）で届けた」という案内か */
const isHandbackPointer = (text: string) => /report was delivered to you as a message/i.test(text);

/**
 * サブエージェントの親への報告（いちばん新しいもの）。報告の渡し方は Claude Code の版・モデルで違うので、次の順に探す:
 * 1. サブエージェントが呼んだ SubagentHandback の本文（再開したら、その回のもの）
 * 2. 終わりの知らせの要約（「別の知らせで届けた」という案内は除く）
 * 3. Agent / Task ツールの結果の文（以前の記録。裏で動かしたときの「起動した」という知らせは除く）
 */
export function subagentReport(entry: SubagentEntry, events: RunEvent[]): string | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    const d = e.data as { name?: string; parent?: string; input?: { message?: string } };
    if (e.type === "tool_use" && d.parent === entry.key && d.name === "SubagentHandback" && d.input?.message) return d.input.message;
  }
  if (entry.summary && !isHandbackPointer(entry.summary)) return entry.summary;
  const result = events.find((e) => {
    const d = e.data as { tool_use_id?: string; parent?: string };
    return e.type === "tool_result" && d.tool_use_id === entry.key && !d.parent;
  });
  const raw = (result?.data as { content?: string } | undefined)?.content;
  return raw && !isBackgroundLaunch(raw) && !isHandbackPointer(raw) ? cleanSubagentReport(raw) : undefined;
}

