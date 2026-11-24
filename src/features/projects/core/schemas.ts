// プロジェクトのルートの zod の形（名前・説明・圧縮前と圧縮後の指示）
import { z } from "zod";
import { COMPACT_PROMPT_MAX } from "@shared/projects/types";

/** プロジェクトの名前と説明（作成・取り込み・編集で同じ。説明の空は null にそろえる） */
export const projectName = z.string().trim().min(1).max(100);
export const projectDescription = z
  .string()
  .max(10_000)
  .nullable()
  .transform((s) => s || null);

/** 圧縮前指示・圧縮後指示（設定の共通の指示・プロジェクトの指示。空にするのは null） */
export const compactPrompt = z.string().trim().min(1).max(COMPACT_PROMPT_MAX).nullable();
