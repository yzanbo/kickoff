import { PROVIDER_AUTH_MODE_LABELS, PROVIDER_LABELS } from "@shared/types";
import { AcpProvider, type AcpProviderOpts, type AcpProviderSpec } from "../acp/provider.js";

/** API キーでないときに動かさない理由（Q11: Antigravity のログインをほかのアプリから使うのは利用規約で禁じられている） */
export const GEMINI_NEEDS_API_KEY = `${PROVIDER_LABELS.gemini} は API キーで動かします（Google のアカウントのログインで Antigravity をほかのアプリから使うのは、利用規約で禁じられているため）。設定の AI の欄でログインの仕方を「${PROVIDER_AUTH_MODE_LABELS.api_key}」にして、Gemini の API キーを置いてください`;

/**
 * Gemini を Antigravity CLI（`agy`）の ACP（`agy acp`）で、Gemini の API キーで動かす決まり（メモの仕様書「0021」の Q11 A・Q13・段階 5）。
 * サブスク（Google のアカウントのログイン）では動かさない。キーは agy の口が環境変数 GEMINI_API_KEY だけなので、起動の環境に入れ、
 * ACP の authenticate は `gemini-api-key`（agy 1.5.9 の初期化の答えで確かめた）。agy がキーを AI のコマンドの環境から外すかは、使い始める前に確かめる。
 * agy 1.5.9 は初期化の答えで http の MCP を受けると言わないので、AI の操作ツールは渡さない（acp/config.ts の mcpServersFor）
 */
export const GEMINI_SPEC: AcpProviderSpec = {
  id: "gemini",
  label: PROVIDER_LABELS.gemini,
  command: "agy",
  installHint: "Antigravity CLI（agy）が見つかりません（brew install --cask antigravity-cli）",
  statusDetail: "Gemini の API キーで動かします（設定の AI の欄で置く）",
  args: () => ["acp"],
  keys: { keyVars: ["GEMINI_API_KEY", "GOOGLE_API_KEY"], apiKeyVar: "GEMINI_API_KEY" },
  authMethod: (params) => (params.auth?.mode === "api_key" ? "gemini-api-key" : null),
  authProblem: (params) => (params.auth?.mode === "api_key" ? (params.auth.apiKey ? null : GEMINI_NEEDS_API_KEY) : GEMINI_NEEDS_API_KEY),
};

export const geminiProvider = (opts: AcpProviderOpts = {}) => new AcpProvider(GEMINI_SPEC, opts);
