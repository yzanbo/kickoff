// チャットの選択（モデル・推論の深さ・権限モード・ファストモード）の決め方（コアと画面で共通。Node 依存を持ち込まないこと）
import type { AppSettings, ChatOptions, ChatOptionsPatch } from "@shared/types";

/** 書いてある項目だけを取り出す（undefined の項目は次の段に従う。推論の深さ・モデルの null は「指定しない」なので残す） */
function written(patch: ChatOptionsPatch | undefined): ChatOptionsPatch {
  return Object.fromEntries(Object.entries(patch ?? {}).filter(([, v]) => v !== undefined));
}

/**
 * チャットの選択を決める。アプリの既定（設定の chat_defaults）の上に、プロジェクトの既定 → 送るときの指定の順に、書いてある項目だけを重ねる。
 * 推論の深さの null は「指定しない」（SDK とモデルの既定に任せる）。権限モードはアプリの既定が「毎回確認」
 */
export function resolveChatOptions(settings: AppSettings, project?: ChatOptionsPatch, override?: ChatOptionsPatch): ChatOptions {
  return { ...settings.chat_defaults, ...written(project), ...written(override) };
}
