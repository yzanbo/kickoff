import type { SDKResultMessage } from "./wire";

/** SDK 2.1.311 の、初期化より前に対象の会話がないと報告する結果だけを消失と判定する。 */
export function confirmedClaudeMissingResume(error: unknown, sessionId: string | null, final: SDKResultMessage | undefined, seenOtherMessage: boolean): boolean {
  if (!sessionId || seenOtherMessage || !(error instanceof Error) || !final || final.subtype !== "error_during_execution" || final.session_id !== sessionId) return false;
  const message = `No conversation found with session ID: ${sessionId}`;
  return error.message === `Claude Code returned an error result: ${message}` && final.errors.length === 1 && final.errors[0] === message;
}
