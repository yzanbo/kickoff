// AI の切り替えのルート: 確かめる中身・切り替える・保留中の引き継ぎを見る・やり直す・受信不明のまま送り直す（段取りは chat の殻の switchProvider など）
import type { Hono } from "hono";
import { z } from "zod";
import { jsonBody } from "@/foundation/core/http/input";
import { lookups } from "@/foundation/core/http/lookups";
import { Conflict, NotFound } from "@/foundation/core/errors";
import type { ChatRunner, Store } from "@/features/chat/core/index";
import { providerSwitchPreview } from "./providerSwitchPreview";

export function providerSwitchRoutes(app: Hono, { store, runner }: { store: Store; runner: ChatRunner }) {
  const { withChat } = lookups(store);

  app.get("/api/chats/:id/provider-switch", withChat, (c) => {
    const target = z.enum(["claude", "codex"]).parse(c.req.query("target"));
    runner.requireIdle(c.var.chat.id, "AI の切り替え");
    return c.json(providerSwitchPreview(store, runner, c.var.chat.id, target));
  });

  app.post("/api/chats/:id/provider-switch", withChat, async (c) => {
    const body = z.object({ target: z.enum(["claude", "codex"]), confirmation: z.string().regex(/^[a-f0-9]{64}$/) }).parse(await jsonBody(c));
    const { chat } = c.var;
    const requireConfirmation = () => {
      if (providerSwitchPreview(store, runner, chat.id, body.target).confirmation !== body.confirmation) throw new Conflict("確認した内容が変わりました。もう一度確かめてください");
    };
    requireConfirmation();
    return c.json(await runner.switchProvider(chat.id, chat.provider, body.target, requireConfirmation));
  });

  // 保留中の引き継ぎを表示する。送る前の資料は準備したもので、受信済みを意味しない。
  app.get("/api/chats/:id/provider-handoff", withChat, (c) => {
    const pending = store.chatProviderHandoffs.get(c.var.chat.id);
    return c.json(pending ? { event_id: pending.eventId, provider: pending.provider, state: pending.state, error: pending.error, context: pending.context } : null);
  });

  app.get("/api/chats/:id/provider-handoff/:eventId", withChat, (c) => {
    const id = z.coerce.number().int().positive().parse(c.req.param("eventId"));
    const event = store.events.get(id);
    if (!event || event.chat_id !== c.var.chat.id || event.type !== "provider_switched") throw new NotFound("AI の切り替え記録が見つかりません");
    const pending = store.chatProviderHandoffs.get(c.var.chat.id);
    return c.json({ event, pending: pending?.eventId === id ? { state: pending.state, error: pending.error } : null });
  });

  // 画面で見た区切りが変わった場合は、別の引き継ぎを誤って再試行しない。
  app.post("/api/chats/:id/provider-handoff/retry", withChat, async (c) => {
    const { event_id } = z.object({ event_id: z.number().int().positive() }).parse(await jsonBody(c));
    const pending = store.chatProviderHandoffs.get(c.var.chat.id);
    if (!pending || pending.eventId !== event_id || pending.state !== "blocked") throw new Conflict("AI の引き継ぎ状態が変わりました。確認し直してください");
    return c.json(await runner.retryProviderHandoff(c.var.chat.id));
  });

  // 受信不明の場合、重複の可能性を利用者が明示的に確認した操作だけを受け付ける。
  app.post("/api/chats/:id/provider-handoff/confirm-resend", withChat, async (c) => {
    const { event_id } = z.object({ event_id: z.number().int().positive(), confirm_duplicate_risk: z.literal(true) }).parse(await jsonBody(c));
    return c.json(await runner.confirmResendProviderHandoff(c.var.chat.id, event_id));
  });
}
