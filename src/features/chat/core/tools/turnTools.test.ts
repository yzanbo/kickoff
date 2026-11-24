// 実行ごとに AI の操作ツールの口を渡し、終わったら鍵を捨てる（turn.ts がレジストリで組み、aiTools/host.ts に登録する）
import { test } from "vitest";
import assert from "node:assert/strict";
import { setupCore, until, watchTools } from "@/app/core/testing/testCore";
import { ScriptedProvider } from "@/features/ai/core/testing";
import { connectToolHost } from "@/foundation/core/testing/mcpClient";
import { McpToolHost } from "@/foundation/core/aiTools/host";
import type { ProviderTurnParams } from "@/features/ai/core/providers/types";

test("実行に、チャットのツールの口を渡し、そこから家系のチャットを読める。終わったら鍵を捨てる", async () => {
  const host = new McpToolHost(() => "http://127.0.0.1:1");
  let seen: ProviderTurnParams | null = null;
  let listed = "";
  let openDuringRun = 0;
  const provider = new ScriptedProvider(async (params) => {
    seen = params;
    openDuringRun = host.openSessions;
    const chat = params.tools?.find((t) => t.name === "kickoff_chat");
    assert.ok(chat, "チャットのツールの口がある");
    const client = await connectToolHost(host, chat);
    const result = await client.callTool({ name: "list_family_chats", arguments: {} });
    listed = (result.content as { text: string }[])[0].text;
    await client.close();
    return { status: "completed", sessionId: "s", turns: 1 };
  });
  const { runner, store, project } = setupCore(provider, { toolHost: host });
  const chat = await runner.start({ projectId: project.id, prompt: "x" });
  await until(() => store.chats.get(chat.id)?.status === "completed");

  assert.equal(openDuringRun, 1);
  assert.match(listed, new RegExp(`"id":\\s*${chat.id}`));
  // 聞かずに使わせる名前（家系のチャットの名前・固定・グループ）が口に載っている
  const endpoint = seen!.tools!.find((t) => t.name === "kickoff_chat")!;
  assert.ok(endpoint.autoAllow.includes("list_family_chats"));
  assert.ok(endpoint.autoAllow.includes("update_chat"));
  assert.equal(host.openSessions, 0);
});

test("コアの MCP サーバーがなければ、口を渡さない", async () => {
  let tools: ProviderTurnParams["tools"] = undefined;
  const provider = new ScriptedProvider(async (params) => {
    tools = params.tools;
    return { status: "completed", sessionId: "s", turns: 1 };
  });
  const { runner, store, project } = setupCore(provider);
  const chat = await runner.start({ projectId: project.id, prompt: "x" });
  await until(() => store.chats.get(chat.id)?.status === "completed");
  assert.deepEqual(tools, []);
});

test("実行が失敗しても鍵を捨てる", async () => {
  const host = new McpToolHost(() => "http://127.0.0.1:1");
  const provider = new ScriptedProvider(async () => {
    throw new Error("落ちた");
  });
  const { runner, store, project } = setupCore(provider, { toolHost: host });
  const chat = await runner.start({ projectId: project.id, prompt: "x" });
  await until(() => store.chats.get(chat.id)?.status === "failed");
  assert.equal(host.openSessions, 0);
});

for (const providerId of ["claude", "codex"] as const) {
  test(`${providerId}: 同じ限定診断ツールを MCP から呼べる。実行終了後は診断も閉じる`, async () => {
    const host = new McpToolHost(() => "http://127.0.0.1:1");
    const provider = new ScriptedProvider(async (params) => {
      params.onAgentSpawned?.(123);
      const endpoint = params.tools!.find((t) => t.name === "kickoff_chat")!;
      assert.ok(endpoint.autoAllow.includes("start_sandbox_diagnostics"));
      assert.ok(endpoint.autoAllow.includes("read_sandbox_denials"));
      const client = await connectToolHost(host, endpoint);
      try {
        const tools = await client.listTools();
        const start = tools.tools.find((t) => t.name === "start_sandbox_diagnostics")!;
        assert.deepEqual(start.inputSchema.properties, {});
        const result = await client.callTool({ name: "start_sandbox_diagnostics", arguments: {} });
        assert.equal(JSON.parse((result.content as { text: string }[])[0].text).status, "capturing");
      } finally { await client.close(); }
      return { status: "completed", sessionId: "s" };
    });
    const rootTime = Math.floor(Date.now() / 1000) * 1000;
    const core = setupCore(provider, { toolHost: host, sandboxDiagnostics: { processes: async () => [{ pid: 123, ppid: 1, startedAt: rootTime }], denials: async () => [] } });
    const tools = watchTools(core, host);
    const chat = await core.runner.start({ projectId: core.project.id, provider: providerId, prompt: "診断" });
    await until(() => core.store.chats.get(chat.id)?.status === "completed");
    // 実行に渡したツールの中身は、実行が終わったら閉じている
    assert.equal(JSON.parse(await tools.call("start_sandbox_diagnostics")).status, "unavailable");
    assert.equal(host.openSessions, 0);
  });
}
