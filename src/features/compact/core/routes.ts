// 圧縮の受け口（取り決めは @shared/compact/contract.ts）: 手で圧縮する・消去する（段取りは chat の殻。預かった指示を外す・書き直すのは送信待ちの口の命令）
import type { Chat } from "@shared/chat/types";
import { compactContract } from "@shared/compact/contract";
import { implement, type Param } from "@/foundation/core/http/implement";
import type { ChatRunner } from "@/features/chat/core/index";

type CompactRunner = Pick<ChatRunner, "compact" | "clear">;

export function compactRoutes({ runner, chatParam }: { runner: CompactRunner; chatParam: Param<Chat> }) {
  return implement(compactContract, {
    context: { chatId: chatParam },
    "POST /api/chats/:chatId/compact": { run: ({ chatId: chat }) => runner.compact(chat.id) },
    "POST /api/chats/:chatId/clear": { run: ({ chatId: chat }) => runner.clear(chat.id) },
  });
}
