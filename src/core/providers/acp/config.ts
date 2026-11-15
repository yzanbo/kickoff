import type { ToolEndpoint } from "../../mcp/host.js";
import type { ProviderTurnParams } from "../types.js";
import type { AgentCapabilities, ContentBlock, McpServerHttp, SessionConfigOption, SessionMode, SessionRequestBase } from "./protocol.js";

/**
 * 実行の指定を ACP の形にする（純粋関数）。どの CLI でも同じ決まりで、違いはエージェントの初期化の答え（capabilities）で分ける
 */

/**
 * AI の操作ツール（コアの MCP サーバー）を ACP の mcpServers にする。エージェントが http の MCP を受けると言ったときだけ渡し
 * （鍵は見出しで JSON-RPC の中で渡す。起動の引数・環境変数には載せない）、言わなければ渡さない（stdio に直すと鍵を引数か環境変数に載せることになるため）
 */
export function mcpServersFor(tools: ToolEndpoint[], caps: AgentCapabilities | undefined): McpServerHttp[] {
  if (!caps?.mcpCapabilities?.http) return [];
  return tools.map((t) => ({ type: "http", name: t.name, url: t.url, headers: Object.entries(t.headers).map(([name, value]) => ({ name, value })) }));
}

/**
 * セッションのモード。Kickoff の守りを当てるため、計画モードのほかは「毎回聞く」モード（ACP の既定。agy は default、Cursor は agent）にして
 * エージェントに聞かせ、権限モードの扱いは Kickoff が承認の頼みで決める（Codex を untrusted にするのと同じ考え）。計画モードは plan
 */
const ASKING_MODES = ["default", "agent"];
export function modeFor(modes: SessionMode[], permissionMode: ProviderTurnParams["permissionMode"]): string | null {
  const wanted = permissionMode === "plan" ? ["plan"] : ASKING_MODES;
  return wanted.find((id) => modes.some((m) => m.id === id)) ?? null;
}

/** 選べる値の一覧（グループの中も） */
function optionValues(option: SessionConfigOption): string[] {
  return (option.options ?? []).flatMap((o) => ("value" in o ? [o.value] : o.options.map((x) => x.value)));
}

/** 選びたい値（モデル・考える深さ）を、エージェントが出した設定の項目に当てる（その値を選べるときだけ。null は指定しない） */
export function configChoices(options: SessionConfigOption[], params: Pick<ProviderTurnParams, "model" | "effort">): { configId: string; value: string }[] {
  const wanted: [string, string | null][] = [
    ["model", params.model],
    ["thought_level", params.effort],
  ];
  return wanted.flatMap(([category, value]) => {
    if (!value) return [];
    const option = options.find((o) => o.category === category && o.type === "select");
    if (!option || option.currentValue === value || !optionValues(option).includes(value)) return [];
    return [{ configId: option.id, value }];
  });
}

const text = (value: string): ContentBlock => ({ type: "text", text: value });

/**
 * 新しいセッション・続きの頼みの共通の形。システムプロンプトに足す文は、エージェントが systemPrompt を受けるなら append で渡し、
 * 受けないなら新しいセッションの最初の指示の前に別の塊で添える（firstPromptPrefix）
 */
export function sessionRequest(params: ProviderTurnParams, caps: AgentCapabilities | undefined): SessionRequestBase {
  const sessionCaps = caps?.sessionCapabilities;
  return {
    cwd: params.cwd,
    mcpServers: mcpServersFor(params.tools ?? [], caps),
    ...(sessionCaps?.additionalDirectories && params.additionalDirectories.length > 0 ? { additionalDirectories: params.additionalDirectories } : {}),
    ...(sessionCaps?.systemPrompt && params.systemPrompt ? { systemPrompt: { mode: "append" as const, content: [text(params.systemPrompt)] } } : {}),
  };
}

/** 指示（新しいセッションでシステムプロンプトを受けないエージェントなら頭にそれを、指示に添える文脈があれば次に別の塊で） */
export function promptBlocks(params: Pick<ProviderTurnParams, "prompt" | "turnContext" | "systemPrompt">, opts: { withSystemPrompt: boolean }): ContentBlock[] {
  return [
    ...(opts.withSystemPrompt && params.systemPrompt ? [text(`<kickoff_context>\n${params.systemPrompt}\n</kickoff_context>`)] : []),
    ...(params.turnContext ? [text(params.turnContext)] : []),
    text(params.prompt),
  ];
}

/**
 * 起動の環境変数: Kickoff の決めた変数（params.env）を重ね、鍵の環境変数（keyVars）は外してから、API キーのときだけ apiKeyVar に入れる
 * （サブスクで動かすときに、手元の鍵の環境変数で使った分の支払いにしない）
 */
export function launchEnv(
  base: Record<string, string | undefined>,
  params: Pick<ProviderTurnParams, "env" | "auth">,
  keys: { keyVars: string[]; apiKeyVar: string | null },
): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...base, ...(params.env ?? {}) };
  for (const name of keys.keyVars) delete env[name];
  if (keys.apiKeyVar && params.auth?.mode === "api_key" && params.auth.apiKey) env[keys.apiKeyVar] = params.auth.apiKey;
  return env;
}
