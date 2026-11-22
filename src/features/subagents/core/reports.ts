// 親に届かなかったサブエージェントの報告を、次に送る指示に添えて渡す（contributor "subagents" の messageNote。送る・伝える文の後ろに。Node 依存なし）
import { collectSubagents, type SubagentEntry } from "@shared/chat/subagents";
import type { TurnContributor, ChatStoreDeps } from "@/features/chat/core/index";

/** 添える報告 1 件の長さの上限（長すぎれば頭だけにし、続きはサブエージェントに聞き直してもらう） */
const MAX_REPORT_CHARS = 6000;

/** 親に届かなかった報告（報告を送ったが、親が動かないまま作業が終わったもの。まだ渡し直していないもの） */
export function undeliveredReports(events: Parameters<typeof collectSubagents>[0]): SubagentEntry[] {
  return collectSubagents(events, {}, false).filter((s) => s.delivery === "lost" && s.undeliveredReport);
}

/**
 * 送る指示の後ろに添える、届かなかった報告（利用者の指示が先。関係がなければ読み流してよいと添える。なければ null）。
 * 添えたものは、記録の自分の発言の handover に行のキーを残し、一覧では「受け取った」にする
 */
export function undeliveredReportsNote(entries: SubagentEntry[]): string | null {
  if (entries.length === 0) return null;
  const reports = entries.map((s) => {
    const id = s.agentId ? `（ID: ${s.agentId}）` : "";
    const report = s.undeliveredReport ?? "";
    const body =
      report.length > MAX_REPORT_CHARS ? `${report.slice(0, MAX_REPORT_CHARS)}\n…（長いので途中まで。続きはサブエージェントに SendMessage で聞いてください）` : report;
    return [`--- サブエージェント「${s.description}」${id}の報告 ---`, body].join("\n");
  });
  return [
    `【届いていなかったサブエージェントの報告 ${entries.length} 件】`,
    "前の作業が、次のサブエージェントの報告を受け取る前に終わっていました。上の指示に関係があれば、この報告も踏まえて進めてください（関係がなければ読み流してかまいません）。",
    ...reports,
  ].join("\n");
}

/** 送る・伝える指示に、親に届かなかった報告を添える（渡したら自分の発言の handover に残るので、次からは返さない） */
export function subagentReportParts(store: Pick<ChatStoreDeps, "events">): TurnContributor {
  return {
    name: "subagents",
    order: 50,
    contribute: () => null,
    messageNote: async (chatId) => {
      const lost = undeliveredReports(store.events.forSubagents(chatId));
      const text = undeliveredReportsNote(lost);
      return text ? { text, handover: lost.map((s) => s.key) } : null;
    },
  };
}
