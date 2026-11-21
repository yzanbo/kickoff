// AI が git のフック（コミット時・push 時の確かめ）を飛ばすコマンドの守り（純粋な関数）:
// git commit / push / merge / am の --no-verify、git commit -n、フックの置き場を変える git -c core.hooksPath=… / --config-env、
// git config で core.hooksPath を書き換える・消すコマンドを、どのプロジェクトでも断る（フックが落ちたら直してからやり直す）。
// 利用者が飛ばすと決めたときは、利用者が自分のターミナルで流す。読むだけ（git config --get core.hooksPath）は断らない。
// うっかりを防ぐもので、スクリプトのファイル・環境変数の GIT_CONFIG_* など、わざと避ける書き方までは見抜けない
import { commandWords, gitParts, scanCommands, type Word } from "@/foundation/core/shell/shellWords";
import type { DenyVerdict, GuardRule } from "@/features/guard/core/rules";

/** --no-verify でフックを飛ばせるサブコマンド */
const VERIFY_SUBCOMMANDS = new Set(["commit", "push", "merge", "am"]);
/** git commit の、次の 1 語を値に取るオプション（値の語を -n・--no-verify と読み違えないように） */
const COMMIT_WITH_VALUE = new Set([
  "-m", "-F", "-C", "-c", "-t", "--message", "--file", "--reuse-message", "--reedit-message", "--template",
  "--author", "--date", "--cleanup", "--fixup", "--squash", "--trailer", "--pathspec-from-file",
]);
/** git commit の短いオプションのうち、続く文字を値に取るもの（-am・-mfix の m の後ろは値） */
const COMMIT_SHORT_WITH_VALUE = new Set(["m", "F", "C", "c", "t", "S", "u"]);
/** git config の、書き換える・消す動き */
const CONFIG_WRITES = new Set(["--unset", "--unset-all", "--add", "--replace-all", "set", "unset", "--remove-section", "--rename-section"]);

const HOOKS_PATH = "core.hookspath";

/** --no-verify（git は紛れのない頭だけでも受け付けるので --no-veri なども） */
const isNoVerify = (text: string) => text.startsWith("--no-veri") && "--no-verify".startsWith(text);

/** git commit の引数に、フックを飛ばすもの（--no-verify・-n・-an など）があるか */
function commitSkipsHooks(args: Word[]): boolean {
  for (let i = 0; i < args.length; i++) {
    const t = args[i].text;
    if (t === "--") return false;
    if (COMMIT_WITH_VALUE.has(t)) {
      i++;
      continue;
    }
    if (isNoVerify(t)) return true;
    if (/^-[a-zA-Z]+$/.test(t)) {
      for (const ch of t.slice(1)) {
        if (ch === "n") return true;
        if (COMMIT_SHORT_WITH_VALUE.has(ch)) break;
      }
    }
  }
  return false;
}

/** git -c / --config-env でフックの置き場を変えるか */
function globalsChangeHooksPath(globals: Word[]): boolean {
  return globals.some((w, i) => {
    const t = w.text.toLowerCase();
    if (t.startsWith("--config-env=")) return t.slice("--config-env=".length).startsWith(HOOKS_PATH);
    return (t === "-c" || t === "--config-env") && (globals[i + 1]?.text.toLowerCase().startsWith(HOOKS_PATH) ?? false);
  });
}

/** git config で core.hooksPath を書き換える・消すか（読むだけなら false） */
function configWritesHooksPath(args: Word[]): boolean {
  const at = args.findIndex((w) => w.text.toLowerCase() === HOOKS_PATH);
  if (at < 0) return false;
  if (args.some((w) => CONFIG_WRITES.has(w.text))) return true;
  // 鍵の後ろに値があれば書く（git config core.hooksPath x）
  return args.slice(at + 1).some((w) => !w.text.startsWith("-"));
}

/** 1 つのコマンドの語から、フックを飛ばす書き方を見つける（なければ null） */
function findInWords(segment: Word[]): string | null {
  const { words } = commandWords(segment);
  const git = gitParts(words);
  if (!git) return null;
  if (globalsChangeHooksPath(git.globals)) return "git -c core.hooksPath=…";
  if (git.sub === "config" && configWritesHooksPath(git.args)) return "git config core.hooksPath";
  if (git.sub === "commit" && commitSkipsHooks(git.args)) return "git commit --no-verify / -n";
  if (git.sub && VERIFY_SUBCOMMANDS.has(git.sub) && git.args.some((w) => isNoVerify(w.text))) return `git ${git.sub} --no-verify`;
  return null;
}

/** 断るときに AI に返す文 */
function gitHookDeniedReason(what: string): string {
  return `Kickoff では ${what} で git のフック（コミット時・push 時の確かめ）を飛ばせません。フックが落ちたなら、出力を読んで原因を直してから、同じコマンドをフックを付けたまま流し直してください。利用者が飛ばすと決めたときは、利用者に自分のターミナルで流してもらってください`;
}

/** ツールの呼び出しが git のフックを飛ばすコマンド（Bash）なら断る（sh -c '…' / bash -c "…" の中の文も、入れ子 3 段まで見る） */
export function evaluateGitHookBypass(toolName: string, input: Record<string, unknown>): DenyVerdict {
  if (toolName !== "Bash" || typeof input.command !== "string") return { kind: "pass" };
  const found = scanCommands(input.command, findInWords);
  return found ? { kind: "deny", reason: gitHookDeniedReason(found) } : { kind: "pass" };
}

/** git のフックを飛ばすコマンドの守り（Bash） */
export function gitHookRule(): GuardRule {
  return { name: "gitHook", kind: "deny", sees: (call) => call.name === "Bash", check: (call) => evaluateGitHookBypass(call.name, call.input) };
}
