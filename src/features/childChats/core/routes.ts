// 子チャットのルート: 子チャットで聞く・分岐・親へ渡す・サブエージェントについて聞く・親から外す（どれも作業中かは chat の殻で見る）
import type { Hono } from "hono";
import { z } from "zod";
import { jsonBody } from "@/foundation/core/http/input";
import { lookups, requireProject } from "@/foundation/core/http/lookups";
import { childChatSchema, handoffSchema, subagentChildSchema } from "@/foundation/core/http/schemas";
import type { ChatDetachBody } from "@shared/foundation/apiTypes";
import type { AgentProvider } from "@/features/ai/core/index";
import type { UploadStore } from "@/features/attachments/core/index";
import { workdirOf, type ChatRunPort, type Store } from "@/features/chat/core/index";
import type { ProviderId } from "@shared/settings/types";
import { startChildChat } from "./children";
import { detachChat } from "./detach";
import { forkChat } from "./fork";
import { handBackToParent } from "./handBack";
import { startSubagentChildChat } from "./subagentChild";

/** 子チャットを親から外す（parent_chat_id: null = 親なし / 先祖の ID = その子に。group_id は親なしにするときだけ） */
const chatDetachSchema = z.object({
  parent_chat_id: z.number().int().positive().nullable(),
  group_id: z.number().int().positive().nullable().optional(),
}) satisfies z.ZodType<ChatDetachBody>;

export interface ChildChatRouteDeps {
  store: Store;
  runner: ChatRunPort;
  providers: Record<ProviderId, AgentProvider>;
  uploads: UploadStore;
  /** 分岐したあと（上の機能が登録したもの。remoteImages が外の画像の覚えを写す）。済むまで待ってから答える */
  forked(fromChatId: number, toChatId: number): Promise<void>;
}

export function childChatRoutes(app: Hono, { store, runner, providers, uploads, forked }: ChildChatRouteDeps) {
  const { withChat } = lookups(store);
  const deps = { store, runner, providers };

  // 作業の終わりの時点から分岐する（作業中は 409。ファイルの記録を、チャットが動いた作業場所で探す）
  app.post("/api/chats/:id/fork", withChat, async (c) => {
    const { chat } = c.var;
    const { event_id } = z.object({ event_id: z.number().int() }).parse(await jsonBody(c));
    runner.requireIdle(chat.id, "分岐");
    const cwd = workdirOf(chat, requireProject(store, chat.project_id));
    const made = await forkChat(deps, chat, event_id, cwd);
    // 分岐したチャットには元の返答がそのまま並ぶので、外の画像の表示の許可と覚えた画像も写す
    await forked(chat.id, made.id);
    return c.json(made, 201);
  });

  // 子チャットで聞く（親の作業中でも始められる。inherit なら親の最後まで終わった作業の時点から会話を引き継ぐ）
  app.post("/api/chats/:id/children", withChat, async (c) => {
    const body = childChatSchema.parse(await jsonBody(c));
    const child = await startChildChat(deps, c.var.chat, { text: body.text, quote: body.quote, inherit: body.inherit, eventId: body.event_id, options: body.options, attachments: body.attachments, provider: body.provider });
    return c.json(child, 201);
  });

  // 子チャットの作業の最後の返答を、直接の親チャットに渡す（via: composer = 入れる文を返して記録だけ / send = 今すぐ送る（作業中なら伝える）/
  // queue = 親の送信待ちの最後に足す）。親のない・終わっていない作業・返答のない作業は 400、親がアーカイブ済みなら 409
  app.post("/api/chats/:id/handoff", withChat, async (c) => {
    const body = handoffSchema.parse(await jsonBody(c));
    return c.json(await handBackToParent(deps, c.var.chat, body));
  });

  // サブエージェントに子チャットで聞く（サブエージェントの会話の記録を添付にして、このチャットの子チャットを作る。201 で子を返す）
  app.post("/api/chats/:id/subagents/:agentId/children", withChat, async (c) => {
    const body = subagentChildSchema.parse(await jsonBody(c));
    const child = await startSubagentChildChat({ ...deps, uploads }, c.var.chat, { agentId: c.req.param("agentId"), text: body.text, attachments: body.attachments, options: body.options });
    return c.json(child, 201);
  });

  /**
   * 子チャットを親から外す（親のないチャットにする・自分の先祖の子に上げる。detach.ts）。先祖でない ID・親なしでないときのグループ・
   * ほかのプロジェクトのグループ・親のないチャットは 400、作業中は 409。外したあとのチャットを返す（知らせは店から）
   */
  app.post("/api/chats/:id/detach", withChat, async (c) => {
    const body = chatDetachSchema.parse(await jsonBody(c));
    return c.json(detachChat(store, (id) => runner.isBusy(id), c.var.chat, { parentId: body.parent_chat_id, groupId: body.group_id ?? null }));
  });
}
