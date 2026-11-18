// コアの MCP サーバー（mcp/host.ts）の口に、HTTP のサーバーを立てずに直接つなぐクライアント。テストからだけ使う
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { McpToolHost, ToolEndpoint } from "../mcp/host.js";

/** 実行に渡された口（鍵の見出し付き）につなぐ（頼みは host.handle に直接渡す）。使い終わったら close する */
export async function connectToolHost(host: McpToolHost, endpoint: ToolEndpoint): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(new URL(endpoint.url), {
    requestInit: { headers: endpoint.headers },
    fetch: (url, init) => host.handle(endpoint.name, new Request(String(url), init as RequestInit)),
  });
  const client = new Client({ name: "test", version: "0" });
  await client.connect(transport);
  return client;
}
