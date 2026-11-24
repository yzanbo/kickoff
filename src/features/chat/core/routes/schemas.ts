// チャットのルートで共通に使う zod の形と上限（送る指示・添付・送信待ち・名前・GitHub の結び付き。検証の失敗の 400 は http/app.ts の onError）
import { z } from "zod";
import { type Attachment, type AttachmentSource, type ChatOptionsPatch, type GitHubLink, ATTACHMENT_SOURCE_TYPES, CHAT_TITLE_MAX, GITHUB_KINDS } from "@shared/chat/types";
import { EFFORT_LEVELS, PERMISSION_MODES, PROVIDER_IDS } from "@shared/settings/types";
import { branchName, folderPath } from "@/foundation/core/http/zodParts";

/** 送る指示 1 件の文字数の上限（チャット・送信待ち・巻き戻しで同じ） */
const MAX_MESSAGE_CHARS = 50_000;
/** 1 回に添えられる添付の数の上限（指示・送信待ちの書き直し・質問への回答で同じ） */
const MAX_ATTACHMENTS = 20;
/** 送信待ちの複数選択の上限 */
export const MAX_QUEUE_SELECTION = 500;

/** 送信待ちの指示の ID */
export const queueId = z.string().min(1).max(100);
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

/** ノートのフォルダからの相対パス（外・隠しファイルは指せない） */
export const notePathSchema = z
  .string()
  .min(1)
  .max(1000)
  .refine((p) => !p.startsWith("/") && p.split("/").every((part) => part !== "" && !part.startsWith(".")), "ノートのパスが正しくありません");

/** 「AI に渡す」で取ったものの出どころ */
export const attachmentSourceSchema = z.object({
  type: z.enum(ATTACHMENT_SOURCE_TYPES),
  label: z.string().min(1).max(500),
  url: z.string().url().max(2000).nullable(),
}) satisfies z.ZodType<AttachmentSource>;

const attachmentBase = {
  id: z.string().uuid(),
  name: z.string().max(300),
  mime: z.string().max(200),
  size: z.number().int().nonnegative(),
};

/** 添付（保存済みのファイル・ノートの写し・「AI に渡す」で取ったもの） */
const attachmentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("file"), ...attachmentBase }),
  z.object({ kind: z.literal("note"), ...attachmentBase, note: notePathSchema, taken_at: z.string().max(40) }),
  z.object({
    kind: z.literal("capture"),
    ...attachmentBase,
    source: attachmentSourceSchema,
    taken_at: z.string().max(40),
    truncated: z.boolean(),
    original_size: z.number().int().nonnegative(),
    redacted: z.number().int().nonnegative(),
  }),
]) satisfies z.ZodType<Attachment>;
export const attachmentsSchema = z.array(attachmentSchema).max(MAX_ATTACHMENTS);

/** 送る指示の文（前後の空白は除く） */
export const messageText = z.string().trim().max(MAX_MESSAGE_CHARS);

// 送る指示（文・選択・添付。@shared/chat/types の MessageBody）。新しいチャット・続き・止めずに伝える・送信待ちで同じ形にし、ルートごとの項目だけを足す。本文が空でも、添付があれば送れる。
// user_view は送った時点の画面の様子（この Mac の画面から送ったときだけ）。形は userView が onUserSend で確かめて覚える（形が違えば覚えないだけで、送るのは断らない）
export const messageShape = { text: messageText.default(""), options: chatOptionsSchema, attachments: attachmentsSchema.default([]), user_view: z.unknown().optional() };
/** 発言の印（子チャットに親への依頼文を頼む・子チャットから渡した依頼）。送る・伝える・送信待ちで同じ */
const marksShape = {
  handoff_request: z.boolean().optional(),
  handoff_from: z.object({ chat_id: z.number().int().positive(), title: z.string().max(500) }).optional(),
};
export const hasContent = (v: { text: string; attachments: unknown[] }) => Boolean(v.text) || v.attachments.length > 0;
export const CONTENT_REQUIRED = { message: "メッセージか添付ファイルが必要です" };

/** チャットの名前（名前の変更・送る前に付けた名前） */
export const chatTitle = z.string().trim().min(1).max(CHAT_TITLE_MAX);

/** GitHub の issue・PR の結び付き（repo は「持ち主/名前」） */
export const githubLinkSchema = z.object({
  repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/, "リポジトリは「持ち主/名前」で書いてください"),
  number: z.number().int().positive(),
  kind: z.enum(GITHUB_KINDS),
}) satisfies z.ZodType<GitHubLink>;

/** 新しいチャットの最初の指示。作業場所は、いまあるワークツリーのフォルダか、新しく作るワークツリーのブランチ名（どちらもなければ本体）。名前を付けていれば、AI に名前を付けてもらわない */
export const newChatSchema = z
  .object({
    ...messageShape,
    title: chatTitle.optional(),
    group_id: z.number().int().optional(),
    worktree_path: folderPath.optional(),
    new_worktree_branch: branchName.optional(),
    github: githubLinkSchema.optional(),
    provider: z.enum(PROVIDER_IDS).optional(),
  })
  .refine(hasContent, CONTENT_REQUIRED);


/** 次の指示を送る本文の欄（hold なら、作業していなくても送らずに列の最後に足す。pause_after なら、その指示のあとで一時停止する。chat の sendSchemas.ts が when を足して広げる） */
export const queueMessageFields = z.object({ ...messageShape, ...marksShape, hold: z.boolean().optional(), pause_after: z.boolean().optional() });
