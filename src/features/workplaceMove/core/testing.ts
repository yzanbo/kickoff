// 作業場所を移すテストの補助: 本体で話したチャット・作業中にして作業場所のツールを渡す・移したあとの続き。テストからだけ使う
import type { createTestCore } from "@/app/core/testing/testCore";
import { watchTools } from "@/app/core/testing/testServer";
import { gitRepo } from "@/foundation/core/testing/gitRepo";
import { until } from "@/foundation/core/testing/until";
import { eventsOf, isBusy, sendAndWait } from "@/features/chat/core/testing";

type Ctx = ReturnType<typeof createTestCore>;

/** 本体に Git の最初のコミットを作り、本体で 1 回話したチャットを返す */
export function mainChat(ctx: Ctx) {
  gitRepo({ dir: ctx.project.repo_path, files: { "a.txt": "a\n" } });
  return sendAndWait(ctx, { projectId: ctx.project.id, text: "こんにちは" });
}

/** 作業中にして、その作業に渡した作業場所のツールを返す（release で作業を終える。持っていく承認は askCarry の答え） */
export async function busyTurn(ctx: Ctx, chatId: number, text = "移って作って") {
  const watch = watchTools(ctx, ctx.mcpTools);
  const before = watch.lastTools();
  const release = ctx.provider.hold();
  await ctx.call("POST", `/api/chats/${chatId}/messages`, { text });
  await until(async () => watch.lastTools() !== before && watch.lastTools().length > 0 && (await isBusy(ctx, chatId)));
  const servers = watch.lastTools();
  const tools = {
    move(args: Record<string, unknown>, askCarry: (request: { files: string[] }) => Promise<boolean>) {
      watch.answer(async (input) => ((await askCarry(input as { files: string[] })) ? { action: "allow" } : { action: "deny" }));
      return watch.call("move_workplace", args, servers);
    },
    cancel: () => watch.call("cancel_workplace_move", {}, servers),
  };
  return { tools, release };
}

/** 移したあとに送った続きの指示（自分の発言のうち workplace_continuation の印のあるもの） */
export async function continuations(ctx: Ctx, chatId: number) {
  return (await eventsOf(ctx, chatId)).flatMap((e) => (e.type === "user" && e.data.workplace_continuation ? [e.data.text] : []));
}

/** 持っていく変更の承認にいつも許す */
export const allowCarry = async () => true;
