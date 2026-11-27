import type { ChatEventOf } from "./chatEvent";

type ResolvedData = ChatEventOf<"approval_resolved">["data"];
type DenyData = Extract<ResolvedData, { action: "deny" }>;

/**
 * 承認を拒否した記録に、利用者が書いた理由か添付があるか（あれば画面・スマホは自分の発言と同じ吹き出しで「拒否の理由」として出し、
 * 書き出す会話にも残す。理由を書かずに拒否した・中断で拒否になったときは「拒否しました」の 1 行）
 */
export function hasDenyReason(data: ResolvedData): data is DenyData & ({ message: string } | { attachments: NonNullable<DenyData["attachments"]> }) {
  return data.action === "deny" && (!!data.message || (data.attachments?.length ?? 0) > 0);
}

/** 拒否の理由の 1 行の文（スマホの流れ・書き出す会話に使う。添付は名前だけを添える） */
export function denyReasonText(data: DenyData): string {
  const files = data.attachments?.length ? `（添付: ${data.attachments.map((a) => a.name).join("、")}）` : "";
  return `${data.message ?? ""}${files}`;
}
