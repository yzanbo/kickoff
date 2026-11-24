// AI の切り替えの受け口（取り決めは @shared/providerSwitch/contract.ts）: 確かめる中身・切り替える・保留中の引き継ぎを見る・やり直す・受信不明のまま送り直す（段取りは chat の殻の switchProvider など）
import { z } from "zod";
import { SWITCHABLE_PROVIDERS } from "@shared/ai/providers";
import type { Chat } from "@shared/chat/types";
import { providerSwitchContract } from "@shared/providerSwitch/contract";
import { Conflict, NotFound } from "@/foundation/core/errors";
import { implement, type Param } from "@/foundation/core/http/implement";
import type { ChatRunner } from "@/features/chat/core/index";
import type { SwitchStore } from "./store";
import { providerSwitchPreview } from "./providerSwitchPreview";

/** 切り替えられる先 */
const target = z.enum(SWITCHABLE_PROVIDERS);

export function providerSwitchRoutes({ store, runner, chatParam }: { store: SwitchStore; runner: ChatRunner; chatParam: Param<Chat> }) {
  return implement(providerSwitchContract, {
    context: { chatId: chatParam, eventId: { parse: (raw: string) => z.coerce.number().int().positive().parse(raw) } },
    "GET /api/chats/:chatId/provider-switch": {
      query: z.object({ target }),
      run: ({ chatId: chat, query }) => {
        runner.requireIdle(chat.id, "AI の切り替え");
        return providerSwitchPreview(store, runner, chat.id, query.target);
      },
    },
    "POST /api/chats/:chatId/provider-switch": {
      body: z.object({ target, confirmation: z.string().regex(/^[a-f0-9]{64}$/) }),
      run: async ({ chatId: chat, body }) => {
        const requireConfirmation = () => {
          if (providerSwitchPreview(store, runner, chat.id, body.target).confirmation !== body.confirmation) throw new Conflict("確認した内容が変わりました。もう一度確かめてください");
        };
        requireConfirmation();
        return runner.switchProvider(chat.id, chat.provider, body.target, requireConfirmation);
      },
    },
    // 保留中の引き継ぎを表示する。送る前の資料は準備したもので、受信済みを意味しない。
    "GET /api/chats/:chatId/provider-handoff": {
      run: ({ chatId: chat }) => {
        const pending = store.chatProviderHandoffs.get(chat.id);
        return pending ? { event_id: pending.eventId, provider: pending.provider, state: pending.state, error: pending.error, context: pending.context } : null;
      },
    },
    "GET /api/chats/:chatId/provider-handoff/:eventId": {
      run: ({ chatId: chat, eventId: id }) => {
        const event = store.events.get(id);
        if (!event || event.chat_id !== chat.id || event.type !== "provider_switched") throw new NotFound("AI の切り替え記録が見つかりません");
        const pending = store.chatProviderHandoffs.get(chat.id);
        return { event, pending: pending?.eventId === id ? { state: pending.state, error: pending.error } : null };
      },
    },
    // 画面で見た区切りが変わった場合は、別の引き継ぎを誤って再試行しない。
    "POST /api/chats/:chatId/provider-handoff/retry": {
      body: z.object({ event_id: z.number().int().positive() }),
      run: ({ chatId: chat, body }) => {
        const pending = store.chatProviderHandoffs.get(chat.id);
        if (!pending || pending.eventId !== body.event_id || pending.state !== "blocked") throw new Conflict("AI の引き継ぎ状態が変わりました。確認し直してください");
        return runner.retryProviderHandoff(chat.id);
      },
    },
    // 受信不明の場合、重複の可能性を利用者が明示的に確認した操作だけを受け付ける。
    "POST /api/chats/:chatId/provider-handoff/confirm-resend": {
      body: z.object({ event_id: z.number().int().positive(), confirm_duplicate_risk: z.literal(true) }),
      run: ({ chatId: chat, body }) => runner.confirmResendProviderHandoff(chat.id, body.event_id),
    },
  });
}
