// 作業場所の移動の取り決め。受け口は src/features/workplaceMove/core/routes.ts
import { empty, route, type Contract } from "@shared/foundation/contract";
import type { WorkplaceMoveBody, WorkplaceMoveCheck } from "@shared/workplaceMove/types";
import type { Chat } from "@shared/chat/types";

export const workplaceMoveContract = {
  /** 別のプロジェクトへ移す（子チャットも一緒に。作業中があれば 409。グループ・作業場所は外し、移った先の本体に）。移したあとのチャット */
  "POST /api/chats/:chatId/move": route<{ project_id: number }, Chat>(),
  /** 移す前の確かめ（元の場所に残る変更・そこで動いているターミナル・移す先にできないワークツリー） */
  "GET /api/chats/:chatId/workplace": route<never, WorkplaceMoveCheck>(),
  /** 作業場所を移す（子チャットは移さない。作業中は 409）。移したあとのチャット */
  "POST /api/chats/:chatId/workplace": route<WorkplaceMoveBody, Chat>(),
  /** AI が予約した作業場所の移動を取り消す（予約がなければ 409） */
  "DELETE /api/chats/:chatId/workplace-move": empty({ access: "device" }),
} as const satisfies Contract;
