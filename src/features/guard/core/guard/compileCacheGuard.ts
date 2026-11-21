// AI が環境変数 NODE_COMPILE_CACHE / NODE_COMPILE_CACHE_PORTABLE を設定するコマンドの守り（純粋な関数）:
// この環境変数を付けて Kickoff（Electron）を起動すると、Kickoff のコードより先にその場所の Node のコンパイルキャッシュが読まれ、
// 細工したキャッシュなら Kickoff の中で別のコードが動く（キーチェーンの鍵で暗号化した DB のパスワード・API キーを開けられる）。
// Kickoff のコードでも Electron の fuse でも塞げないので、設定する書き方（行頭の VAR=値・env VAR=値・export・open --env・
// launchctl setenv・sh -c '…' / eval の中）を、どのプロジェクトでもいつも断る。読むだけ（echo $NODE_COMPILE_CACHE・printenv）・消す（unset）は通す。
// うっかりを防ぐもので、スクリプトのファイル・変数で名前を組み立てるなど、わざと避ける書き方までは見抜けない
import path from "node:path";
import { ASSIGNMENT, scanCommands, shellScriptOf, WRAPPERS, type Word } from "@/foundation/core/shell/shellWords";
import type { DenyVerdict } from "@/features/guard/core/rules";

const NAMES = new Set(["NODE_COMPILE_CACHE", "NODE_COMPILE_CACHE_PORTABLE"]);

/** VAR=値 の VAR が断る名前か */
const setsName = (text: string) => ASSIGNMENT.test(text) && NAMES.has(text.slice(0, text.indexOf("=")));
/** 名前だけ（export NAME）か NAME=値 か */
const namesTarget = (text: string) => NAMES.has(text) || setsName(text);

/** env の、次の 1 語を値に取るオプション（-u NAME は消すだけなので値の語を名前と読まない） */
const ENV_WITH_VALUE = new Set(["-u", "--unset", "-C", "--chdir", "-S", "--split-string"]);
/** 引数の名前を環境変数（シェルの変数）にするコマンド */
const EXPORTERS = new Set(["export", "declare", "typeset", "local", "readonly", "setenv"]);

/** 1 つのコマンドの語から、断る名前を設定する書き方を見つける（なければ null） */
function findInWords(segment: Word[], depth: number): string | null {
  // 行頭の VAR=値 と、前に付けるもの（sudo・env など。env のオプションも飛ばす）
  let i = 0;
  while (i < segment.length) {
    const text = segment[i].text;
    if (ASSIGNMENT.test(text)) {
      if (setsName(text)) return text.slice(0, text.indexOf("=") + 1) + "…";
      i++;
    } else if (WRAPPERS.has(path.basename(text))) {
      const isEnv = path.basename(text) === "env";
      i++;
      while (isEnv && segment[i]?.text.startsWith("-")) {
        const option = segment[i].text;
        if (option.startsWith("-S") || option.startsWith("--split-string")) {
          // env -S 'NAME=値 cmd' は値の文を 1 つのコマンドとして読む
          const script = option.includes("=") ? option.slice(option.indexOf("=") + 1) : option.length > 2 && !option.startsWith("--") ? option.slice(2) : segment[i + 1]?.text;
          const found = script && depth < 3 ? scan(script, depth + 1) : null;
          if (found) return found;
        }
        i += ENV_WITH_VALUE.has(option) ? 2 : 1;
      }
    } else break;
  }
  const words = segment.slice(i);
  const command = words[0] ? path.basename(words[0].text) : "";
  const args = words.slice(1);

  if (EXPORTERS.has(command) && args.some((w) => namesTarget(w.text))) return `${command} NODE_COMPILE_CACHE`;
  if (command === "launchctl" && args[0]?.text === "setenv" && args.slice(1).some((w) => NAMES.has(w.text))) return "launchctl setenv NODE_COMPILE_CACHE";
  // open --env NAME=値 / --env=NAME=値（ほかのコマンドの --env も同じ形なら断る）
  const viaEnvOption = args.some((w, at) => (w.text === "--env" && setsName(args[at + 1]?.text ?? "")) || (w.text.startsWith("--env=") && setsName(w.text.slice("--env=".length))));
  if (viaEnvOption) return `${command || "open"} --env NODE_COMPILE_CACHE=…`;

  // sh -c '…' / bash -c "…" / eval '…' の中の文も見る（入れ子は 3 段まで）
  if (depth >= 3) return null;
  const script = command === "eval" ? args.map((w) => w.text).join(" ") : shellScriptOf(words);
  return script ? scan(script, depth + 1) : null;
}

/**
 * 文の各コマンドを見る。中の文（sh -c・eval・env -S）へは findInWords が自分で下りるので、scanCommands には下りさせない
 * （前に付けるもの（/usr/bin/env・env のオプション）の読み方が scanCommands と違うため）
 */
function scan(command: string, depth: number): string | null {
  return scanCommands(command, (segment) => findInWords(segment, depth), 0);
}

/** 断るときに AI に返す文 */
function compileCacheDeniedReason(what: string): string {
  return `Kickoff では、環境変数 NODE_COMPILE_CACHE / NODE_COMPILE_CACHE_PORTABLE を設定するコマンド（${what}）は流せません。この環境変数を付けて Kickoff を起動すると、Kickoff のコードより先にその場所のコンパイルキャッシュが読まれ、Kickoff の起動に別のコードを差し込める穴があるためです。どうしても要るなら、利用者に自分のターミナルで流してもらってください`;
}

/** ツールの呼び出しが NODE_COMPILE_CACHE を設定するコマンド（Bash）なら断る */
export function evaluateCompileCacheEnv(toolName: string, input: Record<string, unknown>): DenyVerdict {
  if (toolName !== "Bash" || typeof input.command !== "string") return { kind: "pass" };
  // 名前を書いていなければ見るまでもない（ほとんどのコマンドはここで通る）
  if (!input.command.includes("NODE_COMPILE_CACHE")) return { kind: "pass" };
  const found = scan(input.command, 0);
  return found ? { kind: "deny", reason: compileCacheDeniedReason(found) } : { kind: "pass" };
}
