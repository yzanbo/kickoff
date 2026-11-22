// チャットの選択（モデル・推論の深さ・権限モード・ファストモード）の決め方（コアと画面で共通。Node 依存を持ち込まないこと）
import type { ChatOptions, ChatOptionsPatch } from "@shared/settings/types";
import type { Project } from "@shared/projects/types";
import type { ProviderId } from "@shared/settings/types";
import type { AppSettings } from "@shared/foundation/contract/settings";

/** 書いてある項目だけを取り出す（undefined の項目は次の段に従う。推論の深さ・モデルの null は「指定しない」なので残す） */
function written(patch: ChatOptionsPatch | undefined): ChatOptionsPatch {
  return Object.fromEntries(Object.entries(patch ?? {}).filter(([, v]) => v !== undefined));
}

/** その AI のアプリの既定（設定の provider_chat_defaults。AI ごとに別に持つので、Claude Code のモデルの名前をほかの AI に重ねない） */
export function appChatDefaults(settings: Pick<AppSettings, "provider_chat_defaults">, provider: ProviderId): ChatOptions {
  return settings.provider_chat_defaults[provider];
}

/** 決め方に使うプロジェクトの既定 */
type ProjectChatDefaults = Pick<Project, "provider_chat_defaults">;

/**
 * チャットの選択を決める。その AI のアプリの既定の上に、その AI のプロジェクトの既定 → 送るときの指定の順に、書いてある項目だけを重ねる。
 * 推論の深さの null は「指定しない」（SDK とモデルの既定に任せる）。権限モードはアプリの既定が「毎回確認」
 */
export function resolveChatOptions(settings: Pick<AppSettings, "provider_chat_defaults">, provider: ProviderId, project?: ProjectChatDefaults, override?: ChatOptionsPatch): ChatOptions {
  return { ...appChatDefaults(settings, provider), ...written(project?.provider_chat_defaults[provider]), ...written(override) };
}
