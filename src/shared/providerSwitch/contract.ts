// AI の切り替えの取り決め。受け口は src/features/providerSwitch/core/routes.ts
import { route, type Contract } from "@shared/foundation/contract";
import type { ChatEventOf } from "@shared/chat/chatEvent";
import type { SwitchableProvider } from "@shared/ai/providers";
import type { ProviderHandoffStatus, ProviderSwitchPreview, ProviderSwitchResult } from "./types";

/** 切り替えられる先（AI の表で "switch" を持つもの） */
type SwitchTarget = SwitchableProvider;

/** 引き継ぎのやり直し・送り直しの答え（引き継ぎの資料を作れなかったときの注意） */
type HandoffRetryResult = { warning: string | null };

export const providerSwitchContract = {
  /** 切り替える前の確かめ（作業中は 409。確定に渡す確認のハッシュも） */
  "GET /api/chats/:chatId/provider-switch": route<never, ProviderSwitchPreview, { target: SwitchTarget }>(),
  /** 切り替える（確認のハッシュが変わっていれば 409） */
  "POST /api/chats/:chatId/provider-switch": route<{ target: SwitchTarget; confirmation: string }, ProviderSwitchResult>(),
  /** 保留中の引き継ぎ（なければ null。送る前の資料は準備したもので、受け取ったことを意味しない） */
  "GET /api/chats/:chatId/provider-handoff": route<never, ProviderHandoffStatus | null>(),
  /** 切り替えた区切りの記録と、それがいまの保留ならその状態 */
  "GET /api/chats/:chatId/provider-handoff/:eventId": route<never, { event: ChatEventOf<"provider_switched">; pending: Pick<ProviderHandoffStatus, "state" | "error"> | null }>(),
  /** 準備に失敗した引き継ぎをやり直す（画面で見た区切りが変わっていれば 409） */
  "POST /api/chats/:chatId/provider-handoff/retry": route<{ event_id: number }, HandoffRetryResult>(),
  /** 受け取ったか分からない引き継ぎを、二重になりうると承知して送り直す */
  "POST /api/chats/:chatId/provider-handoff/confirm-resend": route<{ event_id: number; confirm_duplicate_risk: true }, HandoffRetryResult>(),
} as const satisfies Contract;
