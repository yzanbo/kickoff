// 承認を聞くときの種類と「覚える」の範囲（AI の実行が聞く形。チャットの承認の一覧 Approval と回答は @shared/chat/approvalTypes）
/**
 * permission: ツールの承認 / question: AI からの質問 / reconnect: 通信の切断で止まり、自動の再開を何度か試しても続かなかった（再開するかを聞く）/
 * usage_limit: 使用枠の上限で止まり、枠が戻った（続けるかを聞く）
 */
export type ApprovalKind = "permission" | "question" | "reconnect" | "usage_limit";

/**
 * 承認カードの「覚える」ボタンの範囲: rule = 許可のルールに足して今後は聞かない（常に許可）/
 * chat = このチャットの間だけ同じものを聞かない（このチャットでは許可。AI の書き込み先の守りが、作業場所の外のファイルを聞くとき）
 */
const REMEMBER_SCOPES = ["rule", "chat"] as const;
export type RememberScope = (typeof REMEMBER_SCOPES)[number];

/** 「覚える」ボタンの文言（label）と説明（title） */
export const REMEMBER_SCOPE_LABELS: Record<RememberScope, { label: string; title: string }> = {
  rule: { label: "常に許可", title: "同じ種類の操作を今後は確認しない" },
  chat: { label: "このチャットでは許可", title: "このチャットでは、同じファイルへの書き込みをもう確認しない" },
};
