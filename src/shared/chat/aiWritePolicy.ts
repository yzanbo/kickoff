// チャットの AI が Kickoff に書くツール（チャットを作る・ほかのプロジェクトのチャット / ノートを変える・自分を移す）に、どの設定が効くか。
// 書く場所で効く設定を 1 つに決める（両方を通すと、承認カードの「常に許可」でどちらが変わるか分かりにくいため）。
// 「AI がチャットを作るとき」が「作らせない」なら、ほかのプロジェクトにもチャットを作らない（はっきりした「やめて」はどこでも守る）
import type { AiWriteMode } from "@shared/settings/types";

/**
 * 書く場面: own_chat = 自分のプロジェクトの中でチャットを作る / other_project_chat = 共通のチャットがほかのプロジェクトにチャットを作る /
 * other_project_write = 共通のチャットがほかのプロジェクトのチャット・ノートを変える・移す、自分をほかのプロジェクトへ移す
 */
export type AiWriteScene = "own_chat" | "other_project_chat" | "other_project_write";

/** 効く設定のキー */
export type AiWriteSetting = "ai_create_chat" | "ai_write_other_projects";

/** 効く設定とその値（ask = 承認カードで聞く・allow = 聞かずに書く・off = 書かせない） */
export interface AiWritePolicy {
  setting: AiWriteSetting;
  mode: AiWriteMode;
}

/** 設定の画面での呼び名（承認カード・断る文に出す） */
export const AI_WRITE_SETTING_LABELS: Record<AiWriteSetting, string> = {
  ai_create_chat: "AI がチャットを作るとき",
  ai_write_other_projects: "共通のチャットがほかのプロジェクトに書くとき",
};

/** scene の書き込みに効く設定（承認カードの「常に許可」で allow に変えるのも、この設定だけ） */
export function aiWritePolicy(settings: Record<AiWriteSetting, AiWriteMode>, scene: AiWriteScene): AiWritePolicy {
  if (scene === "own_chat") return { setting: "ai_create_chat", mode: settings.ai_create_chat };
  if (scene === "other_project_chat" && settings.ai_create_chat === "off") return { setting: "ai_create_chat", mode: "off" };
  return { setting: "ai_write_other_projects", mode: settings.ai_write_other_projects };
}

/** 書かせない設定のとき AI に返す文（どの設定で止めているか） */
export function aiWriteOffText(setting: AiWriteSetting): string {
  return setting === "ai_create_chat"
    ? `利用者が設定（チャット →「${AI_WRITE_SETTING_LABELS.ai_create_chat}」）で、AI がチャットを作るのを止めています（ほかのプロジェクトにも作れません）`
    : `利用者が設定（チャット →「${AI_WRITE_SETTING_LABELS.ai_write_other_projects}」）で、共通のチャットからほかのプロジェクトに書くのを止めています。利用者にそのプロジェクトで頼んでもらってください`;
}

/** 承認カードの説明の終わりに添える、「常に許可」で変わる設定の文 */
export function aiWriteRememberText(setting: AiWriteSetting): string {
  return `「常に許可」にすると、次からは聞かずに${setting === "ai_create_chat" ? "作ります" : "書きます"}（設定の「チャット」の「${AI_WRITE_SETTING_LABELS[setting]}」で戻せます）。`;
}
