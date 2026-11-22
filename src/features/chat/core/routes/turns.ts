// チャットの実行の受け口（取り決めは @shared/chat/contract.ts の chatTurnContract）
import { z } from "zod";
import { chatTurnContract } from "@shared/chat/contract";
import type { ChatRouteDeps } from "./deps";
import { implement } from "@/foundation/core/http/implement";
import { requireProject } from "@/foundation/core/http/lookups";
import { chatOptionsSchema, messageInputSchema, messageText } from "@/foundation/core/http/schemas";
import { sendBodySchema } from "./sendSchemas";
import { rewindFiles, rewindChat } from "@/features/chat/core/rewind";
import { workdirOf } from "@/features/chat/core/workdir";

/**
 * チャットの実行（Turn）: 続きを送る・止めずに伝える・止める・自動の再開をやめる・裏の作業を止める・巻き戻し・ファイルを戻す（子チャット・分岐は childChats、
 * 圧縮は compact、AI が予約した作業場所の移動の取り消しは workplaceMove）。作業中にはできない操作は 409（Runner の requireIdle）。
 * 様子が変わるだけ（止める・やめる）で返すものがなければ 204（変わった様子は SSE の chat_live で届く）
 */
export function turnRoutes({ store, runner, providers, userSent, chatParam }: Pick<ChatRouteDeps, "store" | "runner" | "providers" | "userSent" | "chatParam">) {
  /** 巻き戻しで使う（ファイルの記録を、チャットが動いた作業場所で探す） */
  const deps = { store, runner, providers };
  return implement(chatTurnContract, {
    context: { chatId: chatParam, taskId: { parse: (raw: string) => raw } },
    // 送る口 1 本（@shared/chat/send の SendBody。when: now = 止めずに伝える / later = 作業中なら送信待ちへ。答えは SendResult）。
    // when を省けば前からの続きを送る口（作業中なら 409。答えはチャット）。pause_after なら、この作業が終わったら送信待ちを一時停止する = 質問として送る
    "POST /api/chats/:chatId/messages": {
      body: sendBodySchema,
      run: async ({ chatId: chat, body, caller }) => {
        const { id: _queued, ...sent } = await runner.message(chat.id, body);
        userSent(caller, chat.id, body.user_view);
        return body.when ? sent : sent.chat;
      },
    },
    // 止めずに伝える（送る口の when: now の別名。答えは結果だけ）
    "POST /api/chats/:chatId/tell": {
      body: messageInputSchema,
      run: async ({ chatId: chat, body, caller }) => {
        const told = { result: (await runner.message(chat.id, { ...body, when: "now" })).result };
        userSent(caller, chat.id, body.user_view);
        return told;
      },
    },
    "POST /api/chats/:chatId/cancel": { run: ({ chatId: chat }) => runner.cancel(chat.id) },
    // 通信が切れて止まったチャットを、つながったら自動で再開するのをやめる（待っていなければ 409）
    "DELETE /api/chats/:chatId/reconnect": { run: ({ chatId: chat }) => runner.stopReconnect(chat.id) },
    // 裏で動いている作業を 1 つ止める（サブエージェント・コマンド。作業中でなければ 409）
    "POST /api/chats/:chatId/background/:taskId/stop": { run: async ({ chatId: chat, taskId }) => void (await runner.stopBackgroundTask(chat.id, taskId)) },
    // 自分の発言（user イベント）の手前まで巻き戻して、書き直した文で送り直す（添付は元の発言のもの。restore_files ならファイルも
    // その発言を送る前の状態に戻す。作業中は 409、巻き戻せない発言・プロバイダー・ファイルを戻せないときは 400）
    "POST /api/chats/:chatId/rewind": {
      body: z.object({ event_id: z.number().int(), text: messageText.default(""), options: chatOptionsSchema, restore_files: z.boolean().default(false) }),
      run: ({ chatId: chat, body: { event_id, text, options, restore_files } }) => {
        const cwd = workdirOf(chat, requireProject(store, chat.project_id));
        return rewindChat(deps, chat, { eventId: event_id, text, options, cwd, restoreFiles: restore_files });
      },
    },
    // ファイルだけを、自分の発言を送る前の状態に戻す（会話はそのまま）。dry_run なら戻さずに、変わるファイルと行の増減だけを返す
    // （作業中は 409、戻せない発言（ファイルの記録がない）・プロバイダーは 400）
    "POST /api/chats/:chatId/rewind-files": {
      body: z.object({ event_id: z.number().int(), dry_run: z.boolean().default(false) }),
      run: ({ chatId: chat, body }) => rewindFiles(deps, chat, { eventId: body.event_id, cwd: workdirOf(chat, requireProject(store, chat.project_id)), dryRun: body.dry_run }),
    },
  });
}
