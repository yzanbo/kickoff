// 定型文の本文の形（zod）。取り決め（@shared/snippets/contract.ts）の本文と同じ形かは implement が型で確かめる
import { z } from "zod";
import { SNIPPET_LABEL_MAX, SNIPPET_TEXT_MAX } from "@shared/snippets/types";

/** 名前（前後の空白を削り、空なら null = 本文の 1 行目を見せる） */
const label = z
  .string()
  .trim()
  .max(SNIPPET_LABEL_MAX)
  .nullable()
  .transform((v) => v || null);
/** 本文（空白だけは不可。前後の改行・空白も入れたとおりに残す） */
const text = z
  .string()
  .max(SNIPPET_TEXT_MAX)
  .refine((v) => v.trim() !== "", "本文を入れてください");
const projectId = z.number().int().positive().nullable();

export const newSnippetSchema = z.object({ project_id: projectId, label, text });
export const snippetPatchSchema = z.object({ project_id: projectId.optional(), label: label.optional(), text: text.optional() });
export const snippetOrderSchema = z.object({ ids: z.array(z.number().int()) });
