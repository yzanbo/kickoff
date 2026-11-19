// 失敗を HTTP の応答（状態コードと JSON）にする。zod と外部コマンドの失敗を知るのはここだけ（errors.ts は何も読まない）
import { z } from "zod";
import { AppError } from "@/foundation/core/errors";
import { CommandError } from "@/foundation/core/system/exec";

/** 失敗を応答にする。外部コマンド（Git・gh など）の失敗は、その説明の文のまま 400。知らない失敗は 500 */
export function errorResponse(err: Error): { status: 400 | 404 | 409 | 500; body: { error: string; code?: string; issues?: z.ZodError["issues"] } } {
  if (err instanceof AppError) return { status: err.status, body: err.code ? { error: err.message, code: err.code } : { error: err.message } };
  if (err instanceof z.ZodError) return { status: 400, body: { error: "入力が正しくありません", issues: err.issues } };
  if (err instanceof CommandError) return { status: 400, body: { error: err.message } };
  return { status: 500, body: { error: err.message } };
}
