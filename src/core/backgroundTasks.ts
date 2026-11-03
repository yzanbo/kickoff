import type { RunEvent } from "./types.js";

/** 裏で動かしたサブエージェントの起動を示す、Agent / Task ツールの結果の書き出し（Claude Code が返す文） */
const BACKGROUND_LAUNCH = "Async agent launched";

/** Agent / Task ツールの結果が、裏で動かしたサブエージェントの起動の知らせか（終わったのではなく、始まっただけ） */
export function isBackgroundLaunch(content: unknown): boolean {
  return typeof content === "string" && content.includes(BACKGROUND_LAUNCH);
}

/**
 * いまの作業（最後の自分の発言から後ろ）で裏で動かしたのに、終わりの知らせが届いていないサブエージェントの説明。
 * Kickoff では作業の終わりで Claude Code のプロセスも終わるので、これらはそこで止まる（作業の終わりにお知らせを残すのに使う）
 */
export function unfinishedBackgroundAgents(events: RunEvent[]): string[] {
  let start = 0;
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].type === "user") {
      start = i;
      break;
    }
  }
  const turn = events.slice(start);
  const descriptions = new Map<string, string>();
  for (const e of turn) {
    if (e.type !== "tool_use") continue;
    const d = e.data as { id: string; name: string; input?: { description?: string } };
    if (d.name === "Agent" || d.name === "Task") descriptions.set(d.id, d.input?.description ?? "サブエージェント");
  }
  const launched = turn
    .filter((e) => e.type === "tool_result")
    .map((e) => e.data as { tool_use_id: string; content?: unknown })
    .filter((d) => descriptions.has(d.tool_use_id) && isBackgroundLaunch(d.content))
    .map((d) => d.tool_use_id);
  const finished = new Set(
    turn
      .filter((e) => e.type === "subagent")
      .map((e) => e.data as { tool_use_id?: string; status?: string })
      .filter((d) => d.tool_use_id && d.status !== "running")
      .map((d) => d.tool_use_id!),
  );
  return launched.filter((id) => !finished.has(id)).map((id) => descriptions.get(id)!);
}
