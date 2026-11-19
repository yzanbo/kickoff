// チャットの選択（モデル・推論の深さ・権限モード・ファストモード）の決め方（コアと画面で共通。Node 依存を持ち込まないこと）
import type { AppSettings, ChatOptions, ChatOptionsPatch, Project, ProviderId } from "@shared/types";

/**
 * Claude Code 以外の AI の、アプリの既定の初め（メモの仕様書「0028」の 9 節）。
 * モデル・推論の深さはその AI の既定に任せ、権限モードは毎回確認（設定の chat_defaults は Claude Code のモデルの名前なので重ねない）
 */
export const PROVIDER_BASE_CHAT_OPTIONS: ChatOptions = { model: null, effort: null, permission_mode: "default", fast_mode: false };

/** 書いてある項目だけを取り出す（undefined の項目は次の段に従う。推論の深さ・モデルの null は「指定しない」なので残す） */
function written(patch: ChatOptionsPatch | undefined): ChatOptionsPatch {
  return Object.fromEntries(Object.entries(patch ?? {}).filter(([, v]) => v !== undefined));
}

/** その AI のアプリの既定（Claude Code は設定の chat_defaults、ほかの AI は provider_chat_defaults。前の設定で持っていなければ初めの既定） */
export function appChatDefaults(settings: AppSettings, provider: ProviderId): ChatOptions {
  if (provider === "claude") return settings.chat_defaults;
  return { ...PROVIDER_BASE_CHAT_OPTIONS, ...settings.provider_chat_defaults?.[provider] };
}

/** その AI のプロジェクトの既定（Claude Code はプロジェクトの chat_defaults、ほかの AI は provider_chat_defaults。書いていない項目はアプリの既定に従う） */
function projectChatDefaults(project: ProjectChatDefaults | undefined, provider: ProviderId): ChatOptionsPatch | undefined {
  return provider === "claude" ? project?.chat_defaults : project?.provider_chat_defaults?.[provider];
}

/** 決め方に使うプロジェクトの既定 */
type ProjectChatDefaults = Pick<Project, "chat_defaults"> & Partial<Pick<Project, "provider_chat_defaults">>;

/**
 * チャットの選択を決める。その AI のアプリの既定の上に、その AI のプロジェクトの既定 → 送るときの指定の順に、書いてある項目だけを重ねる。
 * 推論の深さの null は「指定しない」（SDK とモデルの既定に任せる）。権限モードはアプリの既定が「毎回確認」
 */
export function resolveChatOptions(settings: AppSettings, provider: ProviderId, project?: ProjectChatDefaults, override?: ChatOptionsPatch): ChatOptions {
  return { ...appChatDefaults(settings, provider), ...written(projectChatDefaults(project, provider)), ...written(override) };
}
