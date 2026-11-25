// AI が Kickoff に書くツール（チャットを作る・共通のチャットがほかのプロジェクトに書く）の承認。効く設定は @shared/chat/aiWritePolicy で 1 つに決め、
// 書かせないなら聞かずに断り、毎回聞くならツールの中で承認カードを出す（権限モード・Auto mode によらない）。「常に許可」で変えるのは効いた設定だけ
import { aiWriteOffText, aiWritePolicy, aiWriteRememberText, type AiWriteScene } from "@shared/chat/aiWritePolicy";
import type { AiApprovalCard, AiApprovalDecision } from "@/foundation/core/aiTools/tool";
import type { ChatStoreDeps } from "@/features/chat/core/stores";

/** 承認カードの中身（「常に許可」の文と canRemember はここで足す） */
export type AiWriteCard = Omit<AiApprovalCard, "canRemember">;

/** scene の書き込みを書かせない設定なら、AI に返す理由の文で throw（承認を聞く前の確かめ。カードは出さない） */
export function assertAiWriteAllowed(settings: Pick<ChatStoreDeps["settings"], "get">, scene: AiWriteScene): void {
  const policy = aiWritePolicy(settings.get(), scene);
  if (policy.mode === "off") throw new Error(aiWriteOffText(policy.setting));
}

/**
 * scene の書き込みを、効く設定に従って通す: 書かせない → 理由の文で throw / 聞かずに書く → そのまま / 毎回聞く → card で聞き、断られたら throw。
 * 「常に許可」なら効いた設定を「聞かずに…」にする。先に全部確かめてから呼ぶ（聞いたあとで断らないように）。呼ぶ側は聞いている間に消えていないか確かめ直す
 */
export async function approveAiWrite(settings: Pick<ChatStoreDeps["settings"], "get" | "update">, scene: AiWriteScene, ask: (card: AiApprovalCard) => Promise<AiApprovalDecision>, card: AiWriteCard): Promise<void> {
  const policy = aiWritePolicy(settings.get(), scene);
  if (policy.mode === "off") throw new Error(aiWriteOffText(policy.setting));
  if (policy.mode === "allow") return;
  const description = [card.description, aiWriteRememberText(policy.setting)].filter(Boolean).join("");
  const decision = await ask({ ...card, description, canRemember: true });
  if (decision.action === "deny") throw new Error(decision.message ? `利用者が断りました: ${decision.message}` : "利用者が断りました");
  if (decision.action === "allow_always") settings.update(policy.setting === "ai_create_chat" ? { ai_create_chat: "allow" } : { ai_write_other_projects: "allow" });
}
