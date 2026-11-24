// コアの MCP サーバー: 1 回の実行ごとに鍵を発行し、その実行に決めたツールだけを、どの CLI からもつなげる HTTP の口（/mcp/<サーバーの名前>）で出す
import { randomBytes } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { ToolServer } from "./tool";

/** MCP の口のパス（コアの HTTP サーバーの /mcp/<サーバーの名前>） */
export const MCP_PATH = "/mcp";

/** CLI に登録する 1 つの MCP サーバーの口（プロバイダーがそれぞれの書き方で渡す） */
export interface ToolEndpoint {
  /** サーバーの名前（ツールの見え方 mcp__<名前>__<ツール>） */
  name: string;
  url: string;
  /** 付ける見出し（この実行の鍵。環境変数では渡さない = AI が Bash で読めないように） */
  headers: Record<string, string>;
  /** 利用者に聞かずに使わせるツールの名前 */
  autoAllow: string[];
}

/** 1 回の実行の分の口（終わったら close で鍵を捨てる） */
export interface ToolSession {
  endpoints: ToolEndpoint[];
  close(): void;
}

/** Authorization の見出しから鍵を取り出す */
function bearerOf(header: string | null): string | null {
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  return match ? match[1] : null;
}

/** 断るときの答え（鍵が違う・ない・サーバーの名前が違うのを見分けさせない） */
const unauthorized = () => Response.json({ error: "この MCP の口は使えません（鍵が違うか、作業が終わりました）" }, { status: 401 });

export class McpToolHost {
  /** 鍵ごとの、その実行に出すサーバー（名前で引く） */
  private readonly sessions = new Map<string, Map<string, ToolServer>>();

  /** baseUrl: コアの HTTP サーバーをこの Mac の中から呼ぶ URL（http://127.0.0.1:<ポート>） */
  constructor(private readonly baseUrl: () => string) {}

  /** 1 回の実行の分の鍵を発行して、サーバーごとの口を返す（出すサーバーがなければ空） */
  open(servers: ToolServer[]): ToolSession {
    if (servers.length === 0) return { endpoints: [], close: () => {} };
    const token = randomBytes(32).toString("base64url");
    this.sessions.set(token, new Map(servers.map((s) => [s.name, s])));
    const headers = { Authorization: `Bearer ${token}` };
    return {
      endpoints: servers.map((s) => ({ name: s.name, url: `${this.baseUrl()}${MCP_PATH}/${s.name}`, headers, autoAllow: s.autoAllow })),
      close: () => {
        this.sessions.delete(token);
      },
    };
  }

  /** いま発行している鍵の数（テスト・後始末の確かめ） */
  get openSessions(): number {
    return this.sessions.size;
  }

  /**
   * MCP の頼みに答える（鍵の分のサーバーを、頼みごとに作り直して答える = 状態を持たない）。
   * 承認を待つツールは答えまで返らない（JSON の答えで返すので、待つ間は接続を開いたまま）
   */
  async handle(serverName: string, request: Request): Promise<Response> {
    const token = bearerOf(request.headers.get("authorization"));
    const server = token ? this.sessions.get(token)?.get(serverName) : undefined;
    if (!server) return unauthorized();
    const mcp = new McpServer({ name: server.name, version: "1.0.0" }, { instructions: server.instructions });
    for (const tool of server.tools) {
      mcp.registerTool(
        tool.name,
        { description: tool.description, inputSchema: tool.shape, ...(tool.annotations ? { annotations: tool.annotations } : {}) },
        // 結果の形は MCP の CallToolResult と同じ（足りない索引の型だけを合わせる）
        async (args: Record<string, unknown>) => ({ ...(await tool.handler(args)) }),
      );
    }
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await mcp.connect(transport);
    try {
      return await transport.handleRequest(request);
    } finally {
      void mcp.close();
    }
  }
}
