// 実行ごとに AI の操作ツールの口を渡し、終わったら鍵を捨てる（turn.ts と mcp/host.ts）
import { test } from "vitest";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { setupCore, until } from "../testing/testCore.js";
import { ScriptedProvider } from "../testing/fakeProvider.js";
import { McpToolHost, type ToolEndpoint } from "./host.js";
import type { ProviderTurnParams } from "../providers/types.js";

/** 口にコアの MCP サーバーの中身へ直接つなぐクライアント（HTTP のサーバーを立てない） */
async function connect(host: McpToolHost, endpoint: ToolEndpoint) {
  const transport = new StreamableHTTPClientTransport(new URL(endpoint.url), {
    requestInit: { headers: endpoint.headers },
    fetch: (url, init) => host.handle(endpoint.name, new Request(String(url), init as RequestInit)),
  });
  const client = new Client({ name: "test", version: "0" });
  await client.connect(transport);
  return client;
}

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
    const client = await connect(host, chat);
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
