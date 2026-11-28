// 配る版の印鑑の金庫（~/Library/Keychains/nexy-release.keychain-db）と、金庫を開けるコマンドの守り（純粋な関数）:
// 金庫を開けている間は、どのプログラムも配る版の印鑑を押せる（使う人の Mac が本物と認める版を作れる）。
// Kickoff は AI が動く場所そのものなので、AI には金庫に触らせず、金庫を開けるコマンド（npm run publish・npm run install-app）も流させない
// （利用者が macOS のターミナルで流す）。金庫の名前を含むコマンドとファイルのツールを、権限モードに関係なく断る。
// うっかりを防ぐもので、名前を変数で組み立てる・スクリプトのファイルに書くなど、わざと避ける書き方までは見抜けない
import path from "node:path";
import { commandWords, scanCommands } from "@/foundation/core/shell/shellWords";
import type { DenyVerdict, GuardRule } from "@/features/guard/core/rules";
import { normalizeCommand } from "@/features/guard/core/guard/selfProtection";
import { claudeToolOf } from "@shared/ai/claudeTools";

/** 金庫のファイルの名前（scripts/vault.mjs の金庫と同じ。名前で見るので、置き場所の書き方によらない） */
const VAULT_NAME = "nexy-release.keychain";
/** 金庫を開けて署名する npm のスクリプト（package.json）と、その中身のファイル */
const VAULT_SCRIPTS = new Set(["publish", "install-app"]);
const VAULT_FILES = new Set(["publish.mjs", "install-app.mjs"]);

/** 1 つのコマンドが、金庫を開けるスクリプトを流すか（流すなら、その書き方） */
function vaultScriptOf(words: string[]): string | null {
  const [command, ...args] = words;
  const name = command ? path.basename(command) : "";
  if (name === "npm" || name === "pnpm" || name === "yarn") {
    // npm run publish / npm run-script install-app / yarn publish（yarn は run を省ける）
    const at = args[0] === "run" || args[0] === "run-script" ? 1 : name === "yarn" ? 0 : -1;
    const script = at >= 0 ? args[at] : undefined;
    return script && VAULT_SCRIPTS.has(script) ? `${name} run ${script}` : null;
  }
  if (name === "node" || name === "bun" || name === "tsx") {
    const file = args.find((a) => !a.startsWith("-"));
    return file && VAULT_FILES.has(path.basename(file)) ? `${name} ${path.basename(file)}` : null;
  }
  return null;
}

/** 断るときに AI に返す文 */
const deniedReason = (what: string) =>
  `配る版の印鑑の金庫に触る操作（${what}）は、AI からは流せません。金庫を開けている間は、どのプログラムも配る版の印鑑を押せるためです。npm run publish・npm run install-app は、利用者が macOS のターミナルで流します`;

/** ツールの呼び出しが、金庫に触る・金庫を開けるスクリプトを流すものなら断る */
export function evaluateVaultAccess(toolName: string, input: Record<string, unknown>): DenyVerdict {
  const key = claudeToolOf(toolName)?.pathKey;
  const file = key ? input[key] : undefined;
  if (typeof file === "string" && file.includes(VAULT_NAME)) return { kind: "deny", reason: deniedReason("金庫のファイル") };
  if (toolName !== "Bash" || typeof input.command !== "string") return { kind: "pass" };
  const command = normalizeCommand(input.command);
  if (command.includes(VAULT_NAME)) return { kind: "deny", reason: deniedReason("金庫の場所を含むコマンド") };
  const found = scanCommands(command, (segment) => vaultScriptOf(commandWords(segment).words.map((w) => w.text)));
  return found ? { kind: "deny", reason: deniedReason(found) } : { kind: "pass" };
}

/** 金庫の守り（Bash とパスを取るファイルのツール） */
export function vaultRule(): GuardRule {
  return {
    name: "vault",
    kind: "deny",
    sees: (call) => call.name === "Bash" || Boolean(claudeToolOf(call.name)?.pathKey),
    check: (call) => evaluateVaultAccess(call.name, call.input),
  };
}
