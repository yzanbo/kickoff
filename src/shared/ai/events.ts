// AI のつなぎ込みの SSE の種類
import { event, type EventsOf, type EventTable } from "@shared/foundation/contract";
import type { ProviderId } from "@shared/settings/types";
import type { ProjectAiDefaults } from "./chatOptions";
import type { ProviderLoginStatus } from "./types";
import type { ProviderUsage } from "./usage";

export const aiEvents = {
  /**
   * AI の使用状況が変わった（変わったあとのその AI の分）。プランの使用枠の AI（Claude）は取り直すたびと超過分の知らせ、
   * クレジットの AI（Codex）はクレジットの様子が変わったとき（実行中に残りが減った・枠に空きが戻ったなど）
   */
  usage: event<{ usage: ProviderUsage }>(),
  /**
   * AI のブラウザでのログインが終わった（設定の「接続」の「ブラウザでログイン」。POST /api/providers/:id/login で始めたもの。
   * completed = ログインした / failed = できなかった（error に理由）/ cancelled = やめた。画面は AI の状態を読み直す。この Mac の画面だけに届ける）
   */
  provider_login: event<{ provider: ProviderId; status: ProviderLoginStatus; error: string | null }>(),
  /** プロジェクトの AI ごとのチャットの既定を変えた（変えたあとの全部。画面のプロジェクトの設定・新しいチャットの選択が読み直す） */
  project_ai_defaults: event<{ project_id: number; defaults: ProjectAiDefaults }>(),
} as const satisfies EventTable;

declare module "@shared/foundation/contract" {
  interface ServerEventMap extends EventsOf<typeof aiEvents> {}
}
