// AI のつなぎ込みの設定（既定の AI・ログインの仕方・AI ごとの新しいチャットの既定）
import { setting, type SettingTable } from "@shared/foundation/contract/settings";
import { PROVIDER_BASE_CHAT_OPTIONS, type ProviderAuthMode, type ProviderId } from "@shared/settings/types";

export const aiSettings = {
  /** 新規プロジェクトの既定プロバイダー */
  default_provider: setting<ProviderId>({ default: "claude" }),
  /** AI ごとのログインの仕方（書いていない AI はサブスク。API キーそのものは secrets に暗号化して置き、ここには出さない） */
  provider_auth: setting<Partial<Record<ProviderId, ProviderAuthMode>>>({ default: {} }),
  /**
   * AI ごとの新しいチャットの既定の選択（推論の深さの null は指定しない＝モデルの既定。Claude Code のほかの AI はモデルの null もその AI の既定）。
   * AI ごとに既定へ重ね、変えるときは送った AI の分だけを丸ごと置き換える
   */
  provider_chat_defaults: setting<Record<ProviderId, typeof PROVIDER_BASE_CHAT_OPTIONS>>({
    default: {
      claude: { model: "opus", effort: null, permission_mode: "default", fast_mode: false },
      codex: PROVIDER_BASE_CHAT_OPTIONS,
      copilot: PROVIDER_BASE_CHAT_OPTIONS,
      cursor: PROVIDER_BASE_CHAT_OPTIONS,
      gemini: PROVIDER_BASE_CHAT_OPTIONS,
    },
    entries: true,
  }),
} as const satisfies SettingTable;
