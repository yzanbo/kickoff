import { isBackgroundLaunch } from "../../../../core/backgroundTasks";
import type { RunEvent, SubagentInfo } from "../../../../core/types";

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
}

/** Agent / Task ツールの結果の文から、サブエージェントの ID を取り出す（以前の記録で、作業 ID の知らせが残っていないとき） */
const agentIdIn = (content: unknown): string | undefined =>
  typeof content === "string" ? /agentId:\s*([a-z0-9]+)/.exec(content)?.[1] : undefined;

const SUBAGENT_TOOLS = new Set(["Task", "Agent"]);

/** サブエージェントの状態の表示名 */
export const SUBAGENT_STATUS_LABELS: Record<SubagentEntry["status"], string> = {
  running: "実行中",
  completed: "完了",
  failed: "失敗",
  stopped: "中断",
};

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
  for (const e of events) {
    if (e.type === "tool_use") {
      const d = e.data as { id: string; name: string; input?: { description?: string; subagent_type?: string; model?: string } };
      if (!isSubagentTool(d.name)) {
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
        status: "running",
        toolUseEventId: e.id,
      });
    } else if (e.type === "tool_result") {
      const d = e.data as { tool_use_id: string; is_error: boolean; content?: unknown };
      const entry = map.get(d.tool_use_id);
      if (!entry) continue;
      entry.agentId ??= agentIdIn(d.content);
      // 裏で動かしたサブエージェントは、結果が「起動した」という知らせなので、まだ終わっていない（終わりは通知で届く）
      if (isBackgroundLaunch(d.content)) backgrounded.add(entry.key);
      else entry.status = d.is_error ? "failed" : "completed";
    } else if (e.type === "subagent") {
      const d = e.data as unknown as SubagentInfo;
      const own = d.tool_use_id ?? d.task_id;
      const key = taskToKey.get(d.task_id) ?? own;
      if (!map.has(key) && otherTools.has(key)) continue;
      if (map.has(key) || !otherTools.has(own)) taskToKey.set(d.task_id, key);
      // 再開した回の知らせ（呼び出し ID が元の行と違う）は、完了のあとでも作業中に戻す
      const resumed = d.tool_use_id !== undefined && d.tool_use_id !== key;
      if (d.status === "running") {
        // 再開は必ず裏で動く。始まり直したので、前の回の報告は数えない
        if (resumed) backgrounded.add(key);
        handedBack.delete(key);
      }
      const entry = map.get(key) ?? { key, description: d.description || "サブエージェント", status: d.status };
      map.set(key, {
        ...entry,
        description: entry.description || d.description,
        subagentType: entry.subagentType ?? d.subagent_type,
        status: resumed || !(d.status === "running" && entry.status !== "running") ? d.status : entry.status,
        tokens: d.tokens ?? entry.tokens,
        toolUses: d.tool_uses ?? entry.toolUses,
        durationMs: d.duration_ms ?? entry.durationMs,
        agentId: d.task_id || entry.agentId,
        summary: d.summary ?? entry.summary,
      });
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
    if (s.status !== "running") return s;
    const gone = !busy || (live !== undefined && backgrounded.has(s.key) && s.agentId !== undefined && !live.has(s.agentId));
    return gone ? { ...s, status: handedBack.has(s.key) ? "completed" : "stopped" } : s;
  });
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

