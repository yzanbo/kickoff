// 親に届かなかったサブエージェントの報告を、次に送る指示に添えて渡す（Runner の send / tell から使う。Node 依存なし）
import { collectSubagents, type SubagentEntry } from "./subagents.js";

/** 添える報告 1 件の長さの上限（長すぎれば頭だけにし、続きはサブエージェントに聞き直してもらう） */
const MAX_REPORT_CHARS = 6000;

/** 親に届かなかった報告（報告を送ったが、親が動かないまま作業が終わったもの。まだ渡し直していないもの） */
export function undeliveredReports(events: Parameters<typeof collectSubagents>[0]): SubagentEntry[] {
  return collectSubagents(events, {}, false).filter((s) => s.delivery === "lost" && s.undeliveredReport);
}

/**
 * 送る指示の後ろに、届かなかった報告を添える（利用者の指示が先。関係がなければ読み流してよいと添える）。
 * 添えたものは、記録の自分の発言の handover に行のキーを残し、一覧では「受け取った」にする
 */
export function withUndeliveredReports(prompt: string, entries: SubagentEntry[]): string {
  if (entries.length === 0) return prompt;
  const reports = entries.map((s) => {
    const id = s.agentId ? `（ID: ${s.agentId}）` : "";
    const report = s.undeliveredReport ?? "";
    const body =
      report.length > MAX_REPORT_CHARS ? `${report.slice(0, MAX_REPORT_CHARS)}\n…（長いので途中まで。続きはサブエージェントに SendMessage で聞いてください）` : report;
    return [`--- サブエージェント「${s.description}」${id}の報告 ---`, body].join("\n");
  });
  return [
    prompt,
    "",
    `【届いていなかったサブエージェントの報告 ${entries.length} 件】`,
    "前の作業が、次のサブエージェントの報告を受け取る前に終わっていました。上の指示に関係があれば、この報告も踏まえて進めてください（関係がなければ読み流してかまいません）。",
    ...reports,
  ].join("\n");
}
