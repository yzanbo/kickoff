// 子チャットのルート: 子チャットで聞く・分岐・親へ渡す・サブエージェントについて聞く・親から外す（どれも作業中かは chat の殻で見る）
import { z } from "zod";
import { childChatContract } from "@shared/childChats/contract";
import type { Chat } from "@shared/chat/types";
import { implement, type Param } from "@/foundation/core/http/implement";
import { requireProject } from "@/foundation/core/http/lookups";
import type { ChatDetachBody } from "@shared/childChats/types";
import type { AgentProvider } from "@/features/ai/core/index";
import type { UploadStore } from "@/features/attachments/core/index";
import { CONTENT_REQUIRED, hasContent, messageShape, workdirOf, type ChatRunPort, type ChatStoreDeps } from "@/features/chat/core/index";
import { HANDOFF_VIAS } from "@shared/chat/chatEvent";
import { PROVIDER_IDS, type ProviderId } from "@shared/settings/types";
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
  store: Pick<ChatStoreDeps, "chats" | "events" | "settings" | "projects" | "groups" | "aiDefaults">;
  runner: ChatRunPort;
  providers: Record<ProviderId, AgentProvider>;
  uploads: UploadStore;
  /** 分岐したあと（上の機能が登録したもの。remoteImages が外の画像の覚えを写す）。済むまで待ってから答える */
  forked(fromChatId: number, toChatId: number): Promise<void>;
  chatParam: Param<Chat>;
}

/** 子チャットで聞く（文か添付が要る。選んだ文の引用は任意。inherit なら親の会話を引き継ぐ） */
const childChatSchema = z
  .object({
    ...messageShape,
    quote: z.string().max(20_000).nullable().default(null),
    inherit: z.boolean().default(true),
    event_id: z.number().int().positive().nullable().default(null),
    provider: z.enum(PROVIDER_IDS).optional(),
  })
  // 会話を引き継ぐときは、文も添付もなくてよい（聞かずに、親の会話を写した子チャットを開くだけ）
  .refine((v) => v.inherit || hasContent(v), CONTENT_REQUIRED);

/** サブエージェントに子チャットで聞く（文か添付が要る） */
const subagentChildSchema = z.object(messageShape).refine(hasContent, CONTENT_REQUIRED);

/** 子チャットの作業の最後の返答を、親チャットに渡す（POST /api/chats/:id/handoff） */
const handoffSchema = z.object({ via: z.enum(HANDOFF_VIAS), turn_event_id: z.number().int().positive() });

export function childChatRoutes({ store, runner, providers, uploads, forked, chatParam }: ChildChatRouteDeps) {
  const deps = { store, runner, providers };
  return implement(childChatContract, {
    context: { chatId: chatParam, agentId: { parse: (raw: string) => raw } },
    // 作業の終わりの時点から分岐する（作業中は 409。ファイルの記録を、チャットが動いた作業場所で探す）
    "POST /api/chats/:chatId/fork": {
      body: z.object({ event_id: z.number().int() }),
      run: async ({ chatId: chat, body }) => {
        runner.requireIdle(chat.id, "分岐");
        const cwd = workdirOf(chat, requireProject(store, chat.project_id));
        const made = await forkChat(deps, chat, body.event_id, cwd);
        // 分岐したチャットには元の返答がそのまま並ぶので、外の画像の表示の許可と覚えた画像も写す
        await forked(chat.id, made.id);
        return made;
      },
    },
    // 子チャットで聞く（親の作業中でも始められる。inherit なら親の最後まで終わった作業の時点から会話を引き継ぐ）
    "POST /api/chats/:chatId/children": {
      body: childChatSchema,
      run: ({ chatId: chat, body }) => startChildChat(deps, chat, { text: body.text, quote: body.quote, inherit: body.inherit, eventId: body.event_id, options: body.options, attachments: body.attachments, provider: body.provider }),
    },
    // 子チャットの作業の最後の返答を、直接の親チャットに渡す（via: composer = 入れる文を返して記録だけ / send = 今すぐ送る（作業中なら伝える）/
    // queue = 親の送信待ちの最後に足す）。親のない・終わっていない作業・返答のない作業は 400、親がアーカイブ済みなら 409
    "POST /api/chats/:chatId/handoff": { body: handoffSchema, run: ({ chatId: chat, body }) => handBackToParent(deps, chat, body) },
    // サブエージェントに子チャットで聞く（サブエージェントの会話の記録を添付にして、このチャットの子チャットを作る）
    "POST /api/chats/:chatId/subagents/:agentId/children": {
      body: subagentChildSchema,
      run: ({ chatId: chat, agentId, body }) => startSubagentChildChat({ ...deps, uploads }, chat, { agentId, text: body.text, attachments: body.attachments, options: body.options }),
    },
    /**
     * 子チャットを親から外す（親のないチャットにする・自分の先祖の子に上げる。detach.ts）。先祖でない ID・親なしでないときのグループ・
     * ほかのプロジェクトのグループ・親のないチャットは 400、作業中は 409。外したあとのチャットを返す（知らせは店から）
     */
    "POST /api/chats/:chatId/detach": {
      body: chatDetachSchema,
      run: ({ chatId: chat, body }) => detachChat(store, (id) => runner.isBusy(id), chat, { parentId: body.parent_chat_id, groupId: body.group_id ?? null }),
    },
  });
}
