import path from "node:path";
import { z } from "zod";
import { expandHome } from "../../system/paths.js";
import type { ChatOptionsPatch, ChildChatBody, MemoChatBody, NewChatBody, QueueMessageBody, SendMessageBody } from "@shared/types";
import { EFFORT_LEVELS, PERMISSION_MODES } from "@shared/types";
import { PRE_COMPACT_PROMPT_MAX } from "@shared/chat/prompts";

// ルートで共通に使う zod の形と上限（入力の検証に失敗したときの 400 は server.ts の onError が返す。本文・クエリの読み取りは http/input.ts）

/** 送る指示 1 件の文字数の上限（チャット・送信待ち・巻き戻しで同じ） */
const MAX_MESSAGE_CHARS = 50_000;
/** 1 回に添えられる添付の数の上限（指示・送信待ちの書き直し・質問への回答で同じ） */
const MAX_ATTACHMENTS = 20;
/** 送信待ちの複数選択の上限 */
const MAX_QUEUE_SELECTION = 500;

/** ?project_id= などの、省略できる ID（数でなければ 400。NaN を SQL に入れない） */
export const optionalId = z.coerce.number().int().positive().optional();

/** リポジトリの中のパス（ファイル・フォルダ） */
export const repoPath = z.string().min(1).max(1000);

/** 作業場所のフォルダ（ワークツリーの絶対パス） */
export const folderPath = z.string().min(1).max(2000);

/** 絶対パス（~ で始めてもよい）のフォルダの指定か（メモの親フォルダ・プロジェクトのメモのフォルダ） */
export const isAbsoluteFolder = (p: string) => path.isAbsolute(expandHome(p));
export const ABSOLUTE_FOLDER = "フォルダは / か ~ から始まる場所で指定してください";

/** 圧縮前指示（設定の共通の指示・プロジェクトの指示。空にするのは null） */
export const preCompactPrompt = z.string().trim().min(1).max(PRE_COMPACT_PROMPT_MAX).nullable();

/** ?staged=1 などの切り替え（"0" / "1"） */
export const flag = z.enum(["0", "1"]);

export const branchName = z.string().trim().min(1).max(200);

export const groupName = z.string().trim().min(1).max(60);

/** プロジェクトの名前と説明（作成・取り込み・編集で同じ） */
export const projectName = z.string().trim().min(1).max(100);
export const projectDescription = z.string().max(10_000);

/** 音声入力の言語（"auto" か、ISO 639-1 などの言語コード） */
export const voiceLanguage = z.string().regex(/^(auto|[a-z]{2,3})$/, "言語の指定が正しくありません");

/** 送信待ちの指示の ID */
export const queueId = z.string().min(1).max(100);
/** 選んだ送信待ちの指示（複数選択） */
export const queueIdsSchema = z.object({ ids: z.array(queueId).min(1).max(MAX_QUEUE_SELECTION) });
/** 画面で書き直している送信待ちの指示（空でもよい） */
export const editingIdsSchema = z.object({ ids: z.array(queueId).max(MAX_QUEUE_SELECTION) });

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

/** チャットの選択の既定（アプリの設定はすべての項目、プロジェクトは書いた項目だけ。既定のモデルは空にしない） */
export const chatDefaultsSchema = z.object({
  model: z.string().min(1).max(100),
  effort: z.enum(EFFORT_LEVELS).nullable(),
  permission_mode: z.enum(PERMISSION_MODES),
  fast_mode: z.boolean(),
});

/** 添付（アップロード済みのファイル） */
export const attachmentSchema = z.object({
  id: z.string().uuid(),
  name: z.string().max(300),
  mime: z.string().max(200),
  size: z.number().int().nonnegative(),
  // メモの添付（メモのフォルダからの相対パス。外・隠しファイルは指せない）
  memo: z
    .string()
    .min(1)
    .max(1000)
    .refine((p) => !p.startsWith("/") && p.split("/").every((part) => part !== "" && !part.startsWith(".")), "メモのパスが正しくありません")
    .optional(),
});
export const attachmentsSchema = z.array(attachmentSchema).max(MAX_ATTACHMENTS);

/** 送る指示の文（前後の空白は除く） */
export const messageText = z.string().trim().max(MAX_MESSAGE_CHARS);

// 送る指示（文・選択・添付）。新しいチャット・続き・止めずに伝える・送信待ちで同じ形にし、ルートごとの項目だけを足す。本文が空でも、添付があれば送れる
const messageShape = { text: messageText.default(""), options: chatOptionsSchema, attachments: attachmentsSchema.default([]) };
const hasContent = (v: { text: string; attachments: unknown[] }) => Boolean(v.text) || v.attachments.length > 0;
const CONTENT_REQUIRED = { message: "メッセージか添付ファイルが必要です" };

/** 続けて送る・止めずに伝える指示（pause_after なら、この指示の作業が終わったら送信待ちを一時停止する） */
export const messageInputSchema = z.object({ ...messageShape, pause_after: z.boolean().optional() }).refine(hasContent, CONTENT_REQUIRED) satisfies z.ZodType<SendMessageBody>;

/** 新しいチャットの最初の指示。作業場所は、いまあるワークツリーのフォルダか、新しく作るワークツリーのブランチ名（どちらもなければ本体） */
export const newChatSchema = z
  .object({
    ...messageShape,
    group_id: z.number().int().optional(),
    worktree_path: folderPath.optional(),
    new_worktree_branch: branchName.optional(),
  })
  .refine(hasContent, CONTENT_REQUIRED) satisfies z.ZodType<NewChatBody>;

/** メモのチャットの最初の指示（どのメモについてのチャットか） */
export const memoChatSchema = z.object({ ...messageShape, path: repoPath }).refine(hasContent, CONTENT_REQUIRED) satisfies z.ZodType<MemoChatBody>;

/** 子チャットで聞く（文か添付が要る。選んだ文の引用は任意。inherit なら親の会話を引き継ぐ） */
export const childChatSchema = z
  .object({
    ...messageShape,
    quote: z.string().max(20_000).nullable().default(null),
    inherit: z.boolean().default(true),
    event_id: z.number().int().positive().nullable().default(null),
  })
  .refine(hasContent, CONTENT_REQUIRED) satisfies z.ZodType<ChildChatBody, unknown>;

/** 送信待ちに送る指示（hold なら、作業していなくても送らずに列の最後に足す。pause_after なら、その指示のあとで一時停止する） */
export const queueMessageSchema = z.object({ ...messageShape, hold: z.boolean().optional(), pause_after: z.boolean().optional() }).refine(hasContent, CONTENT_REQUIRED) satisfies z.ZodType<QueueMessageBody>;
