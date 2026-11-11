// HTTP API の失敗の種類と、応答（状態コードと JSON）への変換。
// ドメインのコード（chat/・git/・voice/ など）は失敗の種類に合わせて Invalid / NotFound / Conflict を投げ、server.ts の onError が errorResponse でまとめて変換する
// （ルートで boolean を受けて 404 にしたり、例外を包み直したりしない）
import { z } from "zod";
import { errorMessage } from "@shared/errors";
import { CommandError } from "../system/exec.js";

/** 画面に返す失敗（状態コードと文言） */
export class HttpError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    message: string,
    /** 画面が文でなく種類で見分ける失敗の印（DB クライアントの「このワークツリーにはありません」など。なければ省く） */
    readonly code?: string,
  ) {
    super(message);
  }
}

/** 入力が正しくない・その操作はできない（400） */
export class Invalid extends HttpError {
  constructor(message: string) {
    super(400, message);
  }
}

/** 指したもの（チャット・プロジェクト・待ちの指示・ファイルなど）が見つからない（404） */
export class NotFound extends HttpError {
  constructor(message: string, code?: string) {
    super(404, message, code);
  }
}

/** いまの状態ではできない（作業中・回答済み・待っていない・ほかで変わったなど。409） */
export class Conflict extends HttpError {
  constructor(message: string, code?: string) {
    super(409, message, code);
  }
}

/**
 * 外の仕組み（プロバイダーの SDK など）の失敗を、その文のまま「その操作はできない」（400）にする。HttpError はそのまま。
 * promise.catch(asInvalid) の形で、外を呼ぶところで使う
 */
export function asInvalid(e: unknown): never {
  if (e instanceof HttpError) throw e;
  throw new Invalid(errorMessage(e));
}

/** 失敗を応答にする。外部コマンド（Git・gh など）の失敗は、その説明の文のまま 400。知らない失敗は 500 */
export function errorResponse(err: Error): { status: 400 | 404 | 409 | 500; body: { error: string; code?: string; issues?: z.ZodError["issues"] } } {
  if (err instanceof HttpError) return { status: err.status, body: err.code ? { error: err.message, code: err.code } : { error: err.message } };
  if (err instanceof z.ZodError) return { status: 400, body: { error: "入力が正しくありません", issues: err.issues } };
  if (err instanceof CommandError) return { status: 400, body: { error: err.message } };
  return { status: 500, body: { error: err.message } };
}
