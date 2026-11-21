// 作業場所の移動のルート: 別のプロジェクトへ移す・作業場所を移す前の確かめと移す・AI が予約した移動の取り消し（作業中かは chat の殻で見る）
import type { Hono } from "hono";
import { z } from "zod";
import type { WorkplaceMoveBody } from "@shared/foundation/apiTypes";
import { jsonBody } from "@/foundation/core/http/input";
import { lookups, requireProject } from "@/foundation/core/http/lookups";
import { branchName } from "@/foundation/core/http/zodParts";
import { descendantsOf, type ChatRunner, type Store } from "@/features/chat/core/index";
import type { createMover } from "./move";
import { planUserWorkplaceMove, workplaceMoveCheck, type WorkplaceUserMoveDeps } from "./userMove";

export interface WorkplaceMoveRouteDeps extends Pick<WorkplaceUserMoveDeps, "terminals" | "workplace"> {
  store: Store;
  runner: Pick<ChatRunner, "requireIdle" | "reservedFolders" | "cancelWorkplaceMove">;
  move: ReturnType<typeof createMover>;
}

export function workplaceMoveRoutes(app: Hono, { store, runner, move, terminals, workplace }: WorkplaceMoveRouteDeps) {
  const { withChat } = lookups(store);

  /**
   * 別のプロジェクトへ移す（右クリックの「プロジェクトを移動」）。グループ・作業場所（ワークツリー）は元のプロジェクトのものなので外し、
   * 作業場所は移った先の本体にする。会話（Claude Code のセッション）は作業フォルダが変わっても続けられる。作業中は断る。
   * 作業フォルダが変わるので、作業場所を移すのと同じく、会話を新しいセッションに写して区切りを置く（子チャットもそれぞれ）
   */
  app.post("/api/chats/:id/move", withChat, async (c) => {
    const { chat } = c.var;
    const { project_id } = z.object({ project_id: z.number().int().positive() }).parse(await jsonBody(c));
    const target = requireProject(store, project_id);
    if (target.id === chat.project_id) return c.json(chat);
    // 子チャット（子・孫…）も一緒に移す
    const family = descendantsOf(store.chats, chat.id);
    for (const c of [chat, ...family]) runner.requireIdle(c.id, "移動");
    for (const c of family) await move(c.id, { worktreePath: null, projectId: target.id, reason: "project_moved" });
    return c.json(await move(chat.id, { worktreePath: null, projectId: target.id, reason: "project_moved" }));
  });

  // 作業場所を移す（画面の見出しの札・右クリックの「作業場所を変更」）。子チャットは移さない
  const moveDeps = { reservedFolders: () => runner.reservedFolders(), terminals, workplace };
  // 移す前の確かめの中身（元の場所に残る変更・そこで動いているターミナル・移す先にできないワークツリー）
  app.get("/api/chats/:id/workplace", withChat, async (c) => {
    const { chat } = c.var;
    return c.json(await workplaceMoveCheck(moveDeps, chat, requireProject(store, chat.project_id)));
  });
  app.post("/api/chats/:id/workplace", withChat, async (c) => {
    const { chat } = c.var;
    const body = z
      .object({ worktree_path: z.string().min(1).nullable(), new_worktree_branch: branchName.optional(), carry: z.boolean().optional() })
      .parse(await jsonBody(c)) satisfies WorkplaceMoveBody;
    runner.requireIdle(chat.id, "作業場所の変更");
    const { input, steps } = await planUserWorkplaceMove(moveDeps, chat, requireProject(store, chat.project_id), body);
    return c.json(await move(chat.id, input, steps));
  });

  // AI が予約した作業場所の移動を取り消す（作業中の様子の予約の取り消し。スマホからも。予約がなければ 409）
  app.delete("/api/chats/:id/workplace-move", withChat, (c) => {
    runner.cancelWorkplaceMove(c.var.chat.id);
    return c.body(null, 204);
  });
}
