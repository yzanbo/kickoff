import path from "node:path";
import { isInside, realPathLoose } from "./paths.js";

/**
 * 書き込み範囲の制限（プロバイダー非依存）。
 * 要件定義・スケジュールのセクションでは、指定したフォルダの中しか書き込めないようにする。
 */

/** ファイルを書き換えるツールと、その入力のパスのキー */
const WRITE_TOOLS: Record<string, string> = {
  Write: "file_path",
  Edit: "file_path",
  MultiEdit: "file_path",
  NotebookEdit: "notebook_path",
};

/** 読み取りだけのシェルコマンド（範囲制限のあるセクションで許可する） */
const READ_ONLY_COMMANDS = [
  "git status",
  "git diff",
  "git log",
  "git show",
  "git branch",
  "git ls-files",
  "git rev-parse",
  "ls",
  "cat",
  "head",
  "tail",
  "wc",
  "pwd",
  "tree",
  "grep",
  "rg",
];

export const DEFAULT_WRITE_SCOPE = ["docs"];

/**
 * ユーザーが指定したフォルダを、リポジトリからの相対パスに正規化する。
 * 絶対パス（Finder で選んだもの）も受け付け、リポジトリの外なら例外にする。
 */
export function normalizeScope(repoPath: string, input: string): string {
  const root = path.resolve(repoPath);
  const trimmed = input.trim().replace(/\/+$/, "");
  if (!trimmed) throw new Error("フォルダを指定してください");
  const target = path.resolve(root, trimmed);
  if (!isInside(root, target)) throw new Error(`リポジトリの外のフォルダは指定できません: ${input}`);
  const rel = path.relative(root, target);
  return rel === "" ? "." : rel.split(path.sep).join("/");
}

/** filePath が、cwd 配下の scopes のいずれかの中にあるか（シンボリックリンクは実体で見る） */
export function isPathInScope(cwd: string, scopes: string[], filePath: string): boolean {
  const target = realPathLoose(path.resolve(cwd, filePath));
  const root = realPathLoose(cwd);
  return scopes.some((scope) => isInside(scope === "." ? root : path.join(root, scope), target));
}

/** パイプでつないだ各コマンドが読み取り専用か（リダイレクトや連結は不可） */
export function isReadOnlyCommand(command: string): boolean {
  if (/[;&<>`\n]|\$\(/.test(command)) return false;
  return command
    .split("|")
    .map((part) => part.trim())
    .every((part) => READ_ONLY_COMMANDS.some((cmd) => part === cmd || part.startsWith(`${cmd} `)));
}

type ToolDecision = { decision: "allow" | "deny"; reason: string } | { decision: "pass" };

/**
 * 書き込み範囲が決まっているセクションで、ツールの実行を許可・拒否する。
 * - 範囲内のファイル編集は確認なしで許可
 * - 範囲外のファイル編集と、読み取り以外のシェルコマンドは拒否
 * - それ以外のツールは通常の権限の判定に任せる（pass）
 */
export function evaluateScopedToolUse(
  cwd: string,
  scopes: string[],
  toolName: string,
  input: Record<string, unknown>,
): ToolDecision {
  const pathKey = WRITE_TOOLS[toolName];
  if (pathKey) {
    const filePath = input[pathKey];
    if (typeof filePath !== "string") return { decision: "deny", reason: "書き込み先のパスが不明です" };
    if (scopes.length > 0 && isPathInScope(cwd, scopes, filePath)) {
      return { decision: "allow", reason: "書き込みが許可されたフォルダ内です" };
    }
    return {
      decision: "deny",
      reason: scopes.length
        ? `このセクションで書き込めるのは ${scopes.map((s) => `${s}/`).join("、")} の中だけです（${filePath} には書き込めません）`
        : "このセクションではファイルを書き込めません",
    };
  }
  if (toolName === "Bash") {
    const command = typeof input.command === "string" ? input.command.trim() : "";
    if (isReadOnlyCommand(command)) return { decision: "allow", reason: "読み取り専用のコマンドです" };
    return {
      decision: "deny",
      reason: "このセクションで実行できるのは読み取り専用のコマンド（git status / ls / cat など）だけです",
    };
  }
  return { decision: "pass" };
}

/**
 * 参照資料（読むだけのフォルダ・ファイル）への書き込みを止める。どのセクション・権限モードでも効く。
 * readOnly はリポジトリの外にある参照資料の絶対パス（リポジトリの中のものは、ふつうの書き込みの判定に任せる）
 */
export function evaluateReferenceWrite(cwd: string, readOnly: string[], toolName: string, input: Record<string, unknown>): ToolDecision {
  const pathKey = WRITE_TOOLS[toolName];
  if (!pathKey || readOnly.length === 0) return { decision: "pass" };
  const filePath = input[pathKey];
  if (typeof filePath !== "string") return { decision: "pass" };
  const target = realPathLoose(path.resolve(cwd, filePath));
  const hit = readOnly.find((ref) => isInside(realPathLoose(ref), target));
  if (!hit) return { decision: "pass" };
  return { decision: "deny", reason: `参照資料（${hit}）は読むだけで、書き込めません` };
}
