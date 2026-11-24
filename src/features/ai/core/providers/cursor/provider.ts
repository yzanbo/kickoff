import { PROVIDER_LABELS } from "@shared/settings/types";
import { AcpProvider, type AcpProviderOpts, type AcpProviderSpec } from "@/features/ai/core/providers/acp/provider";
import { cursorExtension } from "./extensions";
import { PROVIDERS } from "@shared/ai/providers";

/**
 * Cursor の CLI（`agent`）を ACP（`agent acp`）で動かす決まり（Cursor の説明「CLI ACP」に合わせた）。
 * ログインは Cursor の CLI のもの（`agent login`。ACP の authenticate は `cursor_login`）。API キーは Cursor の口が起動の引数（`--api-key`）か
 * 環境変数 CURSOR_API_KEY だけなので、`ps` で見える引数を避けて環境変数で渡す（Cursor がそれを AI のコマンドの環境から外すかは、使い始める前に確かめる）。
 * MCP は Cursor の説明では `.cursor/mcp.json` のものだけとあり、初期化の答えで http を受けると言わなければ AI の操作ツールは渡さない（acp/config.ts の mcpServersFor）
 */
const CURSOR_SPEC: AcpProviderSpec = {
  id: "cursor",
  label: PROVIDER_LABELS.cursor,
  command: "agent",
  installHint: PROVIDERS.cursor.installHint,
  statusDetail: "Cursor の CLI のログインで動かします（ログインはターミナルで `agent login`）",
  args: () => ["acp"],
  keys: { keyVars: ["CURSOR_API_KEY", "CURSOR_AUTH_TOKEN"], apiKeyVar: "CURSOR_API_KEY" },
  authMethod: () => "cursor_login",
  extension: cursorExtension,
};

export const cursorProvider = (opts: AcpProviderOpts = {}) => new AcpProvider(CURSOR_SPEC, opts);
