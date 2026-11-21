// 作業場所の移動の受け口（取り決めは @shared/workplaceMove/contract.ts）: 別のプロジェクトへ移す・作業場所を移す前の確かめと移す・AI が予約した移動の取り消し（作業中かは chat の殻で見る）
import { z } from "zod";
import type { Chat } from "@shared/chat/types";
import { workplaceMoveContract } from "@shared/workplaceMove/contract";
import { implement, type Param } from "@/foundation/core/http/implement";
import { requireProject } from "@/foundation/core/http/lookups";
import { branchName } from "@/foundation/core/http/zodParts";
import { descendantsOf, type ChatRunner, type Store } from "@/features/chat/core/index";
import type { createMover } from "./move";
import { planUserWorkplaceMove, workplaceMoveCheck, type WorkplaceUserMoveDeps } from "./userMove";

export interface WorkplaceMoveRouteDeps extends Pick<WorkplaceUserMoveDeps, "terminals" | "workplace"> {
  store: Store;
  runner: Pick<ChatRunner, "requireIdle" | "reservedFolders" | "cancelWorkplaceMove">;
  move: ReturnType<typeof createMover>;
  chatParam: Param<Chat>;
}

export function workplaceMoveRoutes({ store, runner, move, terminals, workplace, chatParam }: WorkplaceMoveRouteDeps) {
  // 作業場所を移す（画面の見出しの札・右クリックの「作業場所を変更」）。子チャットは移さない
  const moveDeps = { reservedFolders: () => runner.reservedFolders(), terminals, workplace };
  return implement(workplaceMoveContract, {
    context: { chatId: chatParam },
    // 別のプロジェクトへ移す（右クリックの「プロジェクトを移動」）。作業フォルダが変わるので、会話を新しいセッションに写して区切りを置く（子チャットもそれぞれ）
    "POST /api/chats/:chatId/move": {
      body: z.object({ project_id: z.number().int().positive() }),
      run: async ({ chatId: chat, body }) => {
        const target = requireProject(store, body.project_id);
        if (target.id === chat.project_id) return chat;
        // 子チャット（子・孫…）も一緒に移す
        const family = descendantsOf(store.chats, chat.id);
        for (const c of [chat, ...family]) runner.requireIdle(c.id, "移動");
        for (const c of family) await move(c.id, { worktreePath: null, projectId: target.id, reason: "project_moved" });
        return move(chat.id, { worktreePath: null, projectId: target.id, reason: "project_moved" });
      },
    },
    // 移す前の確かめの中身（元の場所に残る変更・そこで動いているターミナル・移す先にできないワークツリー）
    "GET /api/chats/:chatId/workplace": { run: ({ chatId: chat }) => workplaceMoveCheck(moveDeps, chat, requireProject(store, chat.project_id)) },
    "POST /api/chats/:chatId/workplace": {
      body: z.object({ worktree_path: z.string().min(1).nullable(), new_worktree_branch: branchName.optional(), carry: z.boolean().optional() }),
      run: async ({ chatId: chat, body }) => {
        runner.requireIdle(chat.id, "作業場所の変更");
        const { input, steps } = await planUserWorkplaceMove(moveDeps, chat, requireProject(store, chat.project_id), body);
        return move(chat.id, input, steps);
      },
    },
    // AI が予約した作業場所の移動を取り消す（作業中の様子の予約の取り消し。スマホからも）
    "DELETE /api/chats/:chatId/workplace-move": { run: ({ chatId: chat }) => runner.cancelWorkplaceMove(chat.id) },
  });
}
