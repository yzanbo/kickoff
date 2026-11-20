// 実行に渡した AI の操作ツール（ToolServer）を名前で呼ぶ補助と、決めた答えを返す 1 回の作業の文脈。テストからだけ使う
import type { AiTurn, ToolServer } from "@/foundation/core/aiTools/tool";

/** 渡したツールの名前（サーバーをまたいで並べる） */
export const toolNames = (servers: readonly ToolServer[]): string[] => servers.flatMap((s) => s.tools.map((t) => t.name));

/** ツールを名前で呼び、文を返す（失敗の結果は理由の文で投げる。引数は zod を通さずにそのまま渡す） */
export async function callTool(servers: readonly ToolServer[], name: string, args: Record<string, unknown> = {}): Promise<string> {
  const tool = servers.flatMap((s) => s.tools).find((t) => t.name === name);
  if (!tool) throw new Error(`ツール ${name} を渡していない（${toolNames(servers).join("・")}）`);
  const result = await tool.handler(args);
  const text = result.content.map((c) => (c.type === "text" ? c.text : `[${c.type}]`)).join("\n");
  if (result.isError) throw new Error(text);
  return text;
}

/** 1 回の作業の文脈（聞いたら許可で答える。over で差し替える） */
export function testTurn(over: Partial<AiTurn> = {}): AiTurn {
  const values = new Map<string, unknown>();
  return {
    chatId: 1,
    projectId: 1,
    provider: "claude",
    workdir: "/repo",
    signal: new AbortController().signal,
    ask: async () => ({ action: "allow" }),
    perTurn<T>(key: string, init: () => T): T {
      if (!values.has(key)) values.set(key, init());
      return values.get(key) as T;
    },
    ...over,
  };
}
