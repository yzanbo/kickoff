// AI のつなぎ込みの SSE の種類
import { event, type EventsOf, type EventTable } from "@shared/foundation/contract";
import type { ProviderId } from "@shared/settings/types";
import type { CodexCredits, PlanUsage, ProviderLoginStatus } from "./types";

export const aiEvents = {
  usage: event<{ usage: PlanUsage }>(),
  /** Codex のクレジットの様子が変わった（実行中の知らせ・使用状況の取得で、残りが減った・枠に空きが戻ったなど） */
  codex_credits: event<{ credits: CodexCredits }>(),
  /**
   * AI のブラウザでのログインが終わった（設定の「接続」の「ブラウザでログイン」。POST /api/providers/:id/login で始めたもの。
   * completed = ログインした / failed = できなかった（error に理由）/ cancelled = やめた。画面は AI の状態を読み直す。この Mac の画面だけに届ける）
   */
  provider_login: event<{ provider: ProviderId; status: ProviderLoginStatus; error: string | null }>(),
} as const satisfies EventTable;

declare module "@shared/foundation/contract" {
  interface ServerEventMap extends EventsOf<typeof aiEvents> {}
}
