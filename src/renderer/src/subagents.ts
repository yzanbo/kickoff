import type { RunEvent, SubagentInfo } from "../../core/types";

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
}

const SUBAGENT_TOOLS = new Set(["Task", "Agent"]);

/**
 * チャットのサブエージェントの一覧を組み立てる。保存されたイベント（Task / Agent の呼び出しと結果、開始・終了の通知）と、
 * 画面にだけ届く途中経過（progress: トークン数・直近のツール）を合わせる。busy でなければ、終わっていないものは中断とみなす
 */
export function collectSubagents(events: RunEvent[], progress: Record<string, SubagentInfo>, busy: boolean): SubagentEntry[] {
  const map = new Map<string, SubagentEntry>();
  for (const e of events) {
    if (e.type === "tool_use") {
      const d = e.data as { id: string; name: string; input?: { description?: string; subagent_type?: string; model?: string } };
      if (!SUBAGENT_TOOLS.has(d.name)) continue;
      map.set(d.id, {
        key: d.id,
        description: d.input?.description ?? "サブエージェント",
        subagentType: d.input?.subagent_type,
        model: d.input?.model,
        status: "running",
        toolUseEventId: e.id,
      });
    } else if (e.type === "tool_result") {
      const d = e.data as { tool_use_id: string; is_error: boolean };
      const entry = map.get(d.tool_use_id);
      if (entry) entry.status = d.is_error ? "failed" : "completed";
    } else if (e.type === "subagent") {
      const d = e.data as unknown as SubagentInfo;
      const key = d.tool_use_id ?? d.task_id;
      const entry = map.get(key) ?? { key, description: d.description || "サブエージェント", status: d.status };
      map.set(key, {
        ...entry,
        description: entry.description || d.description,
        subagentType: entry.subagentType ?? d.subagent_type,
        status: d.status === "running" && entry.status !== "running" ? entry.status : d.status,
        tokens: d.tokens ?? entry.tokens,
        toolUses: d.tool_uses ?? entry.toolUses,
        durationMs: d.duration_ms ?? entry.durationMs,
      });
    }
  }
  for (const [key, p] of Object.entries(progress)) {
    const entry = map.get(key);
    if (!entry || entry.status !== "running") continue;
    map.set(key, { ...entry, tokens: p.tokens ?? entry.tokens, toolUses: p.tool_uses ?? entry.toolUses, lastTool: p.last_tool });
  }
  // エージェントが止まっているのに終わっていないものは、中断されたとみなす
  return [...map.values()].map((s) => (!busy && s.status === "running" ? { ...s, status: "stopped" } : s));
}
