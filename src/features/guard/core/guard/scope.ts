import path from "node:path";
import { gitOutput } from "@/foundation/core/workplace/exec";
import { isInside, realPathLoose } from "@/foundation/core/system/paths";
import type { DenyVerdict } from "@/features/guard/core/rules";
import { claudeToolOf } from "@shared/ai/claudeTools";

/**
 * 参照資料（読むだけのフォルダ・ファイル）を書き換えさせない仕組み（プロバイダー非依存）。
 * Claude はフック（PreToolUse）で、権限モードや許可ルールより先にこれで判定する
 */

/** ファイルを書き換えるツールなら、書く先の実体のパス（リンクを解き、まだないファイルはあるところまでの親を解いたもの）。ほかのツールは null */
export function writeTargetOf(cwd: string, toolName: string, input: Record<string, unknown>): string | null {
  const tool = claudeToolOf(toolName);
  const pathKey = tool?.writes ? tool.pathKey : null;
  if (!pathKey) return null;
  const filePath = input[pathKey];
  if (typeof filePath !== "string") return null;
  return realPathLoose(path.resolve(cwd, filePath));
}

/**
 * 参照資料への書き込みを止める。どの権限モードでも効く。
 * readOnly は作業場所の外にある参照資料の絶対パス（作業場所の中のものは、ふつうの書き込みの判定に任せる）
 */
export function evaluateReferenceWrite(cwd: string, readOnly: string[], toolName: string, input: Record<string, unknown>): DenyVerdict {
  if (readOnly.length === 0) return { kind: "pass" };
  const target = writeTargetOf(cwd, toolName, input);
  if (target === null) return { kind: "pass" };
  const hit = readOnly.find((ref) => isInside(realPathLoose(ref), target));
  if (!hit) return { kind: "pass" };
  return { kind: "deny", reason: `参照資料（${hit}）は読むだけで、書き込めません` };
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
): Promise<DenyVerdict> {
  if (toolName === "Bash") {
    const command = input.command;
    if (typeof command === "string" && GIT_WRITE.test(command)) return { kind: "deny", reason: "このチャットでは、Git の中身を変える git のコマンドは使えません（Git で管理していないファイルだけを直します）" };
    return { kind: "pass" };
  }
  const target = writeTargetOf(cwd, toolName, input);
  if (target === null) return { kind: "pass" };
  const root = realPathLoose(cwd);
  if (!isInside(root, target) || target === root) return { kind: "deny", reason: `このチャットは作業場所（${cwd}）の中の、Git で管理していないファイルだけを書けます` };
  if (path.relative(root, target).split(path.sep).includes(".git")) return { kind: "deny", reason: "このチャットでは .git の中は書けません" };
  if (await tracked(root, target)) return { kind: "deny", reason: `${path.relative(root, target)} は Git で管理しているファイルなので、このチャットでは書けません（Git で管理していないファイルだけを直します）` };
  return { kind: "pass" };
}
