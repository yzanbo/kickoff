// AI に渡すツールの定義（プロバイダーに依らない形）。コアの MCP サーバー（host.ts）が、この定義をどの CLI にも同じに出す
import type { z } from "zod";

/** ツールの結果の中身（文か画像） */
export type ToolContent = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };

/** ツールの結果（MCP の CallToolResult と同じ形） */
export interface ToolResult {
  content: ToolContent[];
  isError?: boolean;
}

/** ツールの性質の印（MCP の annotations） */
export interface ToolAnnotations {
  /** 読むだけで何も変えない */
  readOnlyHint?: boolean;
}

/** 1 つのツール（名前・説明・引数の形・中身） */
export interface ToolDef {
  name: string;
  description: string;
  shape: z.ZodRawShape;
  handler: (args: Record<string, unknown>) => Promise<ToolResult>;
  annotations?: ToolAnnotations;
}

/** 1 つの MCP サーバーにまとめて出すツール（名前は CLI からの見え方 mcp__<名前>__<ツール>） */
export interface ToolServer {
  name: string;
  /** 使い方（MCP の instructions として AI に渡す） */
  instructions: string;
  tools: ToolDef[];
  /** 利用者に聞かずに使わせるツールの名前（承認と断りはツールの中で行うもの・読むだけのもの。CLI の許可の設定に直すのはプロバイダー） */
  autoAllow: string[];
}

/** ツールを定義する（引数の形から中身の引数の型を決める） */
export function defineTool<S extends z.ZodRawShape>(
  name: string,
  description: string,
  shape: S,
  handler: (args: z.infer<z.ZodObject<S>>) => Promise<ToolResult>,
  extras?: { annotations?: ToolAnnotations },
): ToolDef {
  return { name, description, shape, handler: handler as ToolDef["handler"], ...(extras?.annotations ? { annotations: extras.annotations } : {}) };
}
