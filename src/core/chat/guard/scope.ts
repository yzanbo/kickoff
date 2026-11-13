import path from "node:path";
import { gitOutput } from "../../git/exec.js";
import { isInside, realPathLoose } from "../../system/paths.js";

/**
 * 参照資料（読むだけのフォルダ・ファイル）を書き換えさせない仕組み（プロバイダー非依存）。
 * Claude はフック（PreToolUse）で、権限モードや許可ルールより先にこれで判定する
 */

/** ファイルを書き換えるツールと、その入力のパスのキー */
const WRITE_TOOLS: Record<string, string> = {
  Write: "file_path",
  Edit: "file_path",
  MultiEdit: "file_path",
  NotebookEdit: "notebook_path",
};

type ToolDecision = { decision: "deny"; reason: string } | { decision: "pass" };

/**
 * 参照資料への書き込みを止める。どの権限モードでも効く。
 * readOnly は作業場所の外にある参照資料の絶対パス（作業場所の中のものは、ふつうの書き込みの判定に任せる）
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

/** Git で管理しているファイルか（絶対パス。Git の外・まだないファイルは false） */
async function gitTracks(cwd: string, absolute: string): Promise<boolean> {
  return gitOutput(cwd, ["ls-files", "--error-unmatch", "--", absolute]).then(
    () => true,
    () => false,
  );
}

/**
 * Git の中身を変える git のサブコマンド（Git で管理していないファイルだけを書けるチャットで断る）。
 * 読むだけのもの（status・diff・log・branch の一覧など）は通す。sed -i などのファイルの書き換えは見抜けない（指示でも禁じる）
 */
const GIT_WRITE = /(?:^|[\s;&|(`])git\s+(?:-[Cc]\s+\S+\s+)*(?:add|commit|rm|mv|checkout|restore|reset|stash|rebase|merge|cherry-pick|revert|push|pull|apply|switch|clean|am|update-index)\b/;

/**
 * Git で管理していないファイルだけを書けるチャット（ワークツリーの実行環境の［AI で整える］）の守り。どの権限モードでも効く。
 * ファイルを書き換えるツールは、作業場所（cwd）の中の、Git で管理していないファイル（.env・.kickoff/ など。まだないファイルも）だけを通す。
 * Bash は、Git の中身を変える git のコマンドを断る
 */
export async function evaluateUntrackedWrite(
  cwd: string,
  toolName: string,
  input: Record<string, unknown>,
  tracked: (cwd: string, absolute: string) => Promise<boolean> = gitTracks,
): Promise<ToolDecision> {
  if (toolName === "Bash") {
    const command = input.command;
    if (typeof command === "string" && GIT_WRITE.test(command)) return { decision: "deny", reason: "このチャットでは、Git の中身を変える git のコマンドは使えません（Git で管理していないファイルだけを直します）" };
    return { decision: "pass" };
  }
  const pathKey = WRITE_TOOLS[toolName];
  if (!pathKey) return { decision: "pass" };
  const filePath = input[pathKey];
  if (typeof filePath !== "string") return { decision: "pass" };
  const root = realPathLoose(cwd);
  const target = realPathLoose(path.resolve(cwd, filePath));
  if (!isInside(root, target) || target === root) return { decision: "deny", reason: `このチャットは作業場所（${cwd}）の中の、Git で管理していないファイルだけを書けます` };
  if (path.relative(root, target).split(path.sep).includes(".git")) return { decision: "deny", reason: "このチャットでは .git の中は書けません" };
  if (await tracked(root, target)) return { decision: "deny", reason: `${path.relative(root, target)} は Git で管理しているファイルなので、このチャットでは書けません（Git で管理していないファイルだけを直します）` };
  return { decision: "pass" };
}
