import path from "node:path";
import { isInside, realPathLoose } from "./paths.js";

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
