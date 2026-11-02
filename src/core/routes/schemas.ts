import type { Context } from "hono";
import { z } from "zod";

// ルートで共通に使う zod の形（入力の検証に失敗したときの 400 は server.ts の onError が返す）

/** URL の ?name= の値（なければ・空なら指定なし） */
export const queryOf = (c: Context, name: string): string | undefined => c.req.query(name) || undefined;

/** ?project_id= などの、省略できる ID（数でなければ 400。NaN を SQL に入れない） */
export const optionalId = z.coerce.number().int().positive().optional();
