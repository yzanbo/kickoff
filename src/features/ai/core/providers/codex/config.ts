import path from "node:path";
import type { EffortLevel } from "@shared/settings/types";
import type { ToolEndpoint } from "@/foundation/core/aiTools/host";
import { isInside } from "@/foundation/core/system/paths";
import type { ProviderTurnParams } from "@/features/ai/core/providers/types";
import { launchEnv } from "@/features/ai/core/providers/shared/process";
import { HOOK_TOKEN_ENV, HOOK_URL_ENV, hookConfig } from "./hooks";
import type { JsonValue, SandboxPolicy, TextInput, ThreadOverrides } from "./protocol";
import { APPROVAL_WAIT_S } from "@/features/ai/core/providers/shared/turnLifecycle";

/**
 * 実行の指定を Codex の app-server の形にする（純粋関数）。
 * 利用者の ~/.codex/config.toml はそのまま読ませ（Claude Code の settingSources と同じ考え）、Kickoff が決めるものだけを上書きする
 */

/** MCP のツールの待ち時間（秒。承認を待つツールのため長く。Claude Code の MCP_TOOL_TIMEOUT と同じ 7 日） */
export const CODEX_MCP_TOOL_TIMEOUT_S = APPROVAL_WAIT_S;

/** Kickoff の推論の深さ → Codex の reasoning effort（Codex に max はないので xhigh。null は指定しない） */
export function codexEffort(effort: EffortLevel | null): string | null {
  if (effort === null) return null;
  return effort === "max" ? "xhigh" : effort;
}

/**
 * AI の操作ツール（コアの MCP サーバー）を、config.toml の mcp_servers.<名前> の上書きにする。鍵は見出し（http_headers）で JSON-RPC の中で渡し、
 * 起動の引数・環境変数には載せない。聞かずに使わせるツールは approval_mode を approve、ほかは Auto mode なら approve・それ以外は prompt（聞く）
 */
export function mcpServerOverrides(tools: ToolEndpoint[], permissionMode: ProviderTurnParams["permissionMode"]): Record<string, JsonValue> {
  const entries = tools.map((t): [string, JsonValue] => [
    `mcp_servers.${t.name}`,
    {
      url: t.url,
      http_headers: { ...t.headers },
      tool_timeout_sec: CODEX_MCP_TOOL_TIMEOUT_S,
      default_tools_approval_mode: permissionMode === "auto" ? "approve" : "prompt",
      tools: Object.fromEntries(t.autoAllow.map((name) => [name, { approval_mode: "approve" }])),
    },
  ]);
  return Object.fromEntries(entries);
}

/**
 * 書けるフォルダ（Bash の砂場の一覧。作業場所は Codex が自分で入れる）。一時フォルダを外すとき（tempDirOf）は、書かせないフォルダを中に持つもの
 * （砂場の一覧に入っている /private/tmp・$TMPDIR の実体）も渡さない（excludeSlashTmp は /tmp の既定の書ける場所を外すだけで、書けるフォルダに名前で渡せば書ける）
 */
function writableRootsOf(params: ProviderTurnParams): string[] {
  const dirs = params.sandbox?.writableDirs ?? [];
  if (tempDirOf(params) === null) return dirs;
  const denied = params.sandbox?.readOnlyDirs ?? [];
  return dirs.filter((dir) => !denied.some((d) => isInside(dir, d)));
}

/**
 * 一時フォルダ（/tmp と app-server の $TMPDIR）を書ける場所から外すか。Codex の砂場（workspaceWrite）には書けるフォルダの中を書かせない口がないので、
 * 一時フォルダの中に書かせないフォルダ（共通のチャットから見た、一時フォルダに置いた利用者のプロジェクト）があるときは一時フォルダごと外す。
 * 外すとコマンドの一時ファイル（zsh のヒアドキュメント・mktemp -t など）が書けなくなるので、置き場 commandTempDir を TMPDIR・TMPPREFIX で渡す（shellEnvSet）。
 * いつも外すとふつうの置き場所のプロジェクトでも一時フォルダを使うコマンド（引数なしの mktemp は TMPDIR を見ない）が止まるので、要るときだけにする
 */
const tempDirOf = (params: ProviderTurnParams): string | null => params.sandbox?.commandTempDir ?? null;

/**
 * Bash とファイルの変更の砂場（Codex の Seatbelt）。計画モードは読むだけ、ほかは作業場所と書けるフォルダ。ネットワークは絞らない（Kickoff の決まり）。
 * Kickoff の砂場の「書かせないフォルダ」（添付・参照資料）は Codex に読めるフォルダとして渡さないので、もともと書けない（一時フォルダの中にあれば tempDirOf）
 */
export function codexSandboxPolicy(params: ProviderTurnParams): SandboxPolicy {
  if (params.permissionMode === "plan") return { type: "readOnly", networkAccess: true };
  if (params.sandboxOff) return { type: "dangerFullAccess" };
  const excludeTemp = tempDirOf(params) !== null;
  return { type: "workspaceWrite", writableRoots: writableRootsOf(params), networkAccess: true, excludeTmpdirEnvVar: excludeTemp, excludeSlashTmp: excludeTemp };
}

/**
 * Kickoff が AI のコマンドに渡すつもりの環境変数のうち、Codex の既定（shell_environment_policy）が名前（KEY・SECRET・TOKEN を含む）でコマンドから外すもの。
 * プロジェクトで選んだ GitHub のアカウントのトークン（turn.ts が params.env に入れる）は AI の gh・git に届ける約束なので、set で明示して渡す
 */
const DELIVERED_SECRET_VARS = ["GH_TOKEN", "GH_ENTERPRISE_TOKEN"];

function shellEnvSet(params: ProviderTurnParams): Record<string, string> {
  const tempDir = tempDirOf(params);
  return {
    ...Object.fromEntries(DELIVERED_SECRET_VARS.flatMap((name) => (params.env?.[name] ? [[name, params.env[name]]] : []))),
    // 一時フォルダを書ける場所から外したときのコマンドの一時ファイルの置き場（TMPPREFIX は zsh のヒアドキュメント。既定は /tmp/zsh で TMPDIR を見ない）
    ...(tempDir !== null ? { TMPDIR: tempDir, TMPPREFIX: path.join(tempDir, "zsh") } : {}),
  };
}

/**
 * 承認の決まり。on-request = ふだんのコマンド・ファイルの変更は砂場の中で聞かずに流し、砂場から出るときだけ聞く。
 * 守りと権限モードは PreToolUse のフック（hooks.ts・preToolUse.ts）で当てる。前の untrusted は、承認したコマンドを砂場の外で動かし、
 * Codex ももう対応しない（非推奨）ため使わない
 */
export const CODEX_APPROVAL_POLICY = "on-request" as const;

/** AI のコマンドの環境から外す変数（フックの口の URL と鍵。フックには app-server の環境から届く） */
const HIDDEN_FROM_COMMANDS = [HOOK_URL_ENV, HOOK_TOKEN_ENV];

/**
 * thread/start・thread/resume の上書き。承認は on-request、守りは PreToolUse のフック（フックを信頼した覚えは turn.ts が足す）。
 * システムプロンプトに足す文は developer_instructions（Codex の既定の指示は残す）。API キーで動かすときは、子プロセスから鍵の環境変数を外す既定を強める
 */
export function threadOverrides(params: ProviderTurnParams): ThreadOverrides {
  const apiKey = params.auth?.mode === "api_key";
  const envSet = shellEnvSet(params);
  return {
    model: params.model,
    cwd: params.cwd,
    approvalPolicy: CODEX_APPROVAL_POLICY,
    sandbox: params.permissionMode === "plan" ? "read-only" : params.sandboxOff ? "danger-full-access" : "workspace-write",
    developerInstructions: params.systemPrompt || null,
    config: {
      ...mcpServerOverrides(params.tools ?? [], params.permissionMode),
      ...hookConfig(),
      "shell_environment_policy.exclude": HIDDEN_FROM_COMMANDS,
      // 作業フォルダの信頼を毎回こちらから伝える（伝えないと Codex が利用者の config.toml に「信頼済みのプロジェクト」の欄を書き足し続ける）。
      // 値は Kickoff に登録したプロジェクトを信頼する（リポジトリの .codex/ も読む）。信頼するかどうかの決まりは Claude と共通で、まだ決めていない。
      // パスに「.」が入っても区切らないよう入れ子で渡す
      projects: { [params.cwd]: { trust_level: "trusted" } },
      "sandbox_workspace_write.writable_roots": writableRootsOf(params),
      "sandbox_workspace_write.network_access": true,
      ...(tempDirOf(params) !== null ? { "sandbox_workspace_write.exclude_slash_tmp": true, "sandbox_workspace_write.exclude_tmpdir_env_var": true } : {}),
      ...(apiKey ? { "shell_environment_policy.ignore_default_excludes": false } : {}),
      ...(Object.keys(envSet).length > 0 ? { "shell_environment_policy.set": envSet } : {}),
    },
  };
}

/** 指示（指示に添える文脈があれば先に別の塊で） */
export function turnInput(params: Pick<ProviderTurnParams, "prompt" | "turnContext">): TextInput[] {
  const text = (value: string): TextInput => ({ type: "text", text: value, text_elements: [] });
  return [...(params.turnContext ? [text(params.turnContext)] : []), text(params.prompt)];
}

/** API キー・トークンの環境変数（サブスクで動かすときは外し、使った分の支払いにしない） */
const CODEX_KEY_VARS = ["CODEX_API_KEY", "OPENAI_API_KEY", "CODEX_ACCESS_TOKEN"];

/**
 * app-server の起動の引数と環境変数。
 * サブスク: Codex のログイン（~/.codex の資格情報）のまま。鍵の環境変数は外す。
 * API キー: CODEX_API_KEY で渡し、forced_login_method="api" で API キーのログインにする。account/login/start の apiKey は使わない
 * （Codex の資格情報の置き場（~/.codex/auth.json）を書き換え、利用者のサブスクのログインを消すため）。鍵の入る変数は、Codex の既定（shell_environment_policy）が
 * コマンドの環境から外す（threadOverrides でその既定を強める）。本物で効くかは使い始める前に確かめる
 */
export function appServerLaunch(
  base: Record<string, string | undefined>,
  params: Pick<ProviderTurnParams, "env" | "auth">,
  hook?: { url: string; token: string },
): { args: string[]; env: Record<string, string | undefined> } {
  const apiKey = params.auth?.mode === "api_key" && params.auth.apiKey ? params.auth.apiKey : null;
  // フックの口（PreToolUse のフックが app-server の環境から読む。AI のコマンドからは外す = threadOverrides）
  const env = launchEnv(base, params.env, {
    drop: [...CODEX_KEY_VARS, HOOK_URL_ENV, HOOK_TOKEN_ENV],
    set: { ...(hook ? { [HOOK_URL_ENV]: hook.url, [HOOK_TOKEN_ENV]: hook.token } : {}), ...(apiKey ? { CODEX_API_KEY: apiKey } : {}) },
  });
  const args = apiKey ? ["app-server", "-c", 'forced_login_method="api"'] : ["app-server"];
  return { args, env };
}
