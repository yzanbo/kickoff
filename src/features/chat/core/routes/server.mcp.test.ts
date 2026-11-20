// コアの MCP サーバー（/mcp/<サーバーの名前>）: 実行ごとの鍵・その実行のツールだけ・鍵を捨てたら使えない・承認を待つツール
import { test } from "vitest";
import assert from "node:assert/strict";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { setup } from "@/app/core/testing/testServer";
import type { ToolServer } from "@/foundation/core/aiTools/tool";
import type { ToolEndpoint } from "@/foundation/core/aiTools/host";

/** 文を返すだけのツールを 1 つ持つサーバー */
function echoServer(name = "kickoff_test"): ToolServer {
  return {
    name,
    instructions: "テスト用のツール",
    autoAllow: ["echo"],
    tools: [{ name: "echo", description: "文をそのまま返す", shape: { text: z.string() }, handler: async ({ text }) => ({ content: [{ type: "text", text: `echo:${String(text)}` }] }) }],
  };
}

/** 口につなぐ MCP のクライアント（HTTP はテストのアプリにそのまま渡す） */
async function connect(app: ReturnType<typeof setup>["app"], endpoint: ToolEndpoint) {
  const transport = new StreamableHTTPClientTransport(new URL(endpoint.url), {
    requestInit: { headers: endpoint.headers },
    fetch: async (url, init) => app.request(String(url), init as RequestInit),
  });
  const client = new Client({ name: "test", version: "0" });
  await client.connect(transport);
  return client;
}

test("MCP: 実行ごとの鍵で、その実行のツールと使い方を出す", async () => {
  const { app, mcpTools } = setup();
  const session = mcpTools.open([echoServer()]);
  const [endpoint] = session.endpoints;
  assert.equal(endpoint.name, "kickoff_test");
  assert.match(endpoint.url, /\/mcp\/kickoff_test$/);
  assert.match(endpoint.headers.Authorization, /^Bearer \S{20,}$/);
  assert.deepEqual(endpoint.autoAllow, ["echo"]);

  const client = await connect(app, endpoint);
  assert.equal(client.getInstructions(), "テスト用のツール");
  assert.deepEqual((await client.listTools()).tools.map((t) => t.name), ["echo"]);
  const result = await client.callTool({ name: "echo", arguments: { text: "hi" } });
  assert.deepEqual(result.content, [{ type: "text", text: "echo:hi" }]);
  await client.close();
  session.close();
});

test("MCP: 鍵がない・違う・捨てた・ほかのサーバーの名前は 401", async () => {
  const { app, mcpTools } = setup();
  const session = mcpTools.open([echoServer()]);
  const [endpoint] = session.endpoints;
  const init = (headers: Record<string, string>) => ({
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  assert.equal((await app.request("/mcp/kickoff_test", init({}))).status, 401);
  assert.equal((await app.request("/mcp/kickoff_test", init({ Authorization: "Bearer wrong" }))).status, 401);
  assert.equal((await app.request("/mcp/kickoff_other", init(endpoint.headers))).status, 401);
  session.close();
  assert.equal(mcpTools.openSessions, 0);
  assert.equal((await app.request("/mcp/kickoff_test", init(endpoint.headers))).status, 401);
});

test("MCP: 出すサーバーがなければ口を作らない", () => {
  const { mcpTools } = setup();
  const session = mcpTools.open([]);
  assert.deepEqual(session.endpoints, []);
  assert.equal(mcpTools.openSessions, 0);
});

test("MCP: 実行ごとの鍵は別々で、ほかの実行のツールは使えない", async () => {
  const { app, mcpTools } = setup();
  const a = mcpTools.open([echoServer("kickoff_a")]);
  const b = mcpTools.open([echoServer("kickoff_b")]);
  assert.notEqual(a.endpoints[0].headers.Authorization, b.endpoints[0].headers.Authorization);
  // b の鍵で a のサーバーを指しても通らない
  const res = await app.request("/mcp/kickoff_a", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...b.endpoints[0].headers },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  assert.equal(res.status, 401);
  a.close();
  b.close();
});

test("MCP: 承認を待つツールは答えが出るまで返らない（待ち時間で切らない）", async () => {
  const { app, mcpTools } = setup();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const server: ToolServer = {
    name: "kickoff_wait",
    instructions: "",
    autoAllow: [],
    tools: [
      {
        name: "wait",
        description: "答えが出るまで待つ",
        shape: {},
        handler: async () => {
          await gate;
          return { content: [{ type: "text", text: "done" }] };
        },
      },
    ],
  };
  const session = mcpTools.open([server]);
  const client = await connect(app, session.endpoints[0]);
  let finished = false;
  const call = client.callTool({ name: "wait", arguments: {} }).then((r) => {
    finished = true;
    return r;
  });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(finished, false);
  release();
  assert.deepEqual((await call).content, [{ type: "text", text: "done" }]);
  await client.close();
  session.close();
});
