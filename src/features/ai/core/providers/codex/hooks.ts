import type { JsonValue } from "./protocol";

/**
 * Codex の PreToolUse フック。シェルのコマンド（Bash）とファイルの変更（apply_patch）の前に、
 * Codex が下の sh のコマンドを起こし、実行ごとに開く 127.0.0.1 の口（hookServer.ts）へ入力をそのまま渡して、Kickoff の守りと権限モードで判定する。
 * ふだんのコマンドは Codex の砂場（workspace-write）の中で動かし（approvalPolicy は on-request）、守りはこのフックで当てる（Claude Code と同じ組み方）。
 * フックの中身はいつも同じ文にする（Codex はフックの中身の指紋で信頼を覚えるので、実行ごとに変えると毎回信頼し直すことになる）。
 * 口の URL と鍵は app-server の環境変数で渡し、AI のコマンドの環境からは外す（config.ts の shell_environment_policy.exclude）
 */

/** フックの口の URL と鍵を渡す環境変数の名前 */
export const HOOK_URL_ENV = "KICKOFF_CODEX_HOOK_URL";
export const HOOK_TOKEN_ENV = "KICKOFF_CODEX_HOOK_TOKEN";

/** フックを当てるツール（Codex の名前。apply_patch は Edit・Write の別名にも当たる） */
const HOOK_MATCHER = "^(Bash|apply_patch)$";

/** フックの待ち時間（秒。承認カードの答えを待つため長く。Claude Code のフック・MCP の待ち時間と同じ 7 日） */
const HOOK_TIMEOUT_S = 7 * 24 * 60 * 60;

/** 口に問い合わせられなかったときに返す文（守りを当てられないので止める） */
export const HOOK_UNREACHABLE = "Kickoff の守りに問い合わせられなかったので止めました。もう一度試すか、利用者に知らせてください";

/** 断る答え（PreToolUse の hookSpecificOutput。理由の文は AI に届く） */
export function hookDeny(reason: string): { hookSpecificOutput: { hookEventName: "PreToolUse"; permissionDecision: "deny"; permissionDecisionReason: string } } {
  return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } };
}

/** sh の 1 語に囲む（' を '\'' にする） */
const shQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/**
 * フックのコマンド: 標準入力の JSON を口へ渡し、答えの JSON をそのまま出す（空なら何も言わない = 通す）。
 * 口に届かない・失敗したら断る答えを出す（守りを当てずに通さない）。curl は macOS に入っている /usr/bin/curl（利用者の HTTP_PROXY などで 127.0.0.1 を中継に送らないよう --noproxy）。
 * Codex がシェルを通して動かしても、引数に分けて動かしても同じになるよう /bin/sh -c で包む
 */
const HOOK_SCRIPT = [
  `out=$(/usr/bin/curl -sS --fail --noproxy '*' -X POST -H "Authorization: Bearer $${HOOK_TOKEN_ENV}" -H "Content-Type: application/json" --data-binary @- "$${HOOK_URL_ENV}")`,
  `&& { printf '%s' "$out"; exit 0; };`,
  `printf '%s' ${shQuote(JSON.stringify(hookDeny(HOOK_UNREACHABLE)))}`,
].join(" ");
export const HOOK_COMMAND = `/bin/sh -c ${shQuote(HOOK_SCRIPT)}`;

/** スレッドの上書きに足すフックの設定（点区切りのキー。フックの機能も明示して有効にする） */
export function hookConfig(): Record<string, JsonValue> {
  return {
    "features.hooks": true,
    "hooks.PreToolUse": [{ matcher: HOOK_MATCHER, hooks: [{ type: "command", command: HOOK_COMMAND, timeout: HOOK_TIMEOUT_S }] }],
  };
}

/** フックを信頼した覚え（Codex の hooks.state。利用者の config.toml は書き換えず、スレッドの上書きで渡す） */
export function hookTrustConfig(key: string, hash: string): Record<string, JsonValue> {
  return { "hooks.state": { [key]: { trusted_hash: hash } } };
}

/** hooks/list の 1 つのフック（使う所だけ） */
export interface ListedHook {
  key: string;
  eventName: string;
  source: string;
  command?: string;
  currentHash: string;
  trustStatus: string;
  enabled: boolean;
}

/** hooks/list の答えから、Kickoff が渡したフックを探す（なければ null） */
export function findKickoffHook(response: { data: Array<{ hooks: ListedHook[] }> }): ListedHook | null {
  for (const entry of response.data) {
    const hook = entry.hooks.find((h) => h.source === "sessionFlags" && h.eventName === "preToolUse" && h.command === HOOK_COMMAND);
    if (hook) return hook;
  }
  return null;
}

/** フックに届く入力（PreToolUse。使う所だけ） */
export interface PreToolUseInput {
  tool_name?: string;
  tool_use_id?: string;
  tool_input?: { command?: unknown } & Record<string, unknown>;
}

/** apply_patch のパッチの文から、変えるファイル（足す・変える・消す・移す先）を読む */
export function patchPaths(patch: string): string[] {
  const paths: string[] = [];
  for (const line of patch.split("\n")) {
    const m = line.match(/^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/);
    if (m) paths.push(m[1].trim());
  }
  return [...new Set(paths)];
}
