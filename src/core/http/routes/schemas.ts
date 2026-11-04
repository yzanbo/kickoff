import type { Context } from "hono";
import { z } from "zod";
import type { ChatOptionsPatch } from "@shared/types";
import { EFFORT_LEVELS, PERMISSION_MODES } from "@shared/types";
import { Invalid } from "../errors.js";

// ルートで共通に使う zod の形（入力の検証に失敗したときの 400 は server.ts の onError が返す）

/** URL の ?name= の値（なければ・空なら指定なし） */
export const queryOf = (c: Context, name: string): string | undefined => c.req.query(name) || undefined;

/**
 * 本文（JSON）を読む（形は呼ぶ側が zod で確かめる）。空の本文は {}（省ける項目だけのルートは本文なしで呼べ、必須の項目があれば検証で 400）。
 * JSON として読めなければ 400（読み取りの例外をそのまま 500 にしない）。本文はここ以外で読まない
 */
export async function jsonBody(c: Context): Promise<unknown> {
  const text = await c.req.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Invalid("本文が JSON として読めません");
  }
}

/** ?project_id= などの、省略できる ID（数でなければ 400。NaN を SQL に入れない） */
export const optionalId = z.coerce.number().int().positive().optional();

/** リポジトリの中のパス（ファイル・フォルダ） */
export const repoPath = z.string().min(1).max(1000);

/** 作業場所のフォルダ（ワークツリーの絶対パス） */
export const folderPath = z.string().min(1).max(2000);

/** ?staged=1 などの切り替え（"0" / "1"） */
export const flag = z.enum(["0", "1"]);

export const branchName = z.string().trim().min(1).max(200);

export const groupName = z.string().trim().min(1).max(60);

/** 音声入力の言語（"auto" か、ISO 639-1 などの言語コード） */
export const voiceLanguage = z.string().regex(/^(auto|[a-z]{2,3})$/, "言語の指定が正しくありません");

/** チャットの送り方の選択（モデル・推論の深さ・権限モード・速いモード） */
export const chatOptionsSchema = z
  .object({
    model: z.string().max(100).nullable(),
    effort: z.enum(EFFORT_LEVELS).nullable(),
    permission_mode: z.enum(PERMISSION_MODES),
    fast_mode: z.boolean(),
  })
  .partial()
  .default({}) satisfies z.ZodType<ChatOptionsPatch>;

/** 添付（アップロード済みのファイル） */
export const attachmentSchema = z.object({
  id: z.string().uuid(),
  name: z.string().max(300),
  mime: z.string().max(200),
  size: z.number().int().nonnegative(),
});

/** 続けて送る指示（本文が空でも、添付があれば送れる） */
export const messageInputSchema = z
  .object({
    text: z.string().trim().max(50_000).default(""),
    options: chatOptionsSchema,
    attachments: z.array(attachmentSchema).max(20).default([]),
  })
  .refine((v) => v.text || v.attachments.length > 0, { message: "メッセージか添付ファイルが必要です" });
