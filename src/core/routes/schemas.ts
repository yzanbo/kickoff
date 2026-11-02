import type { Context } from "hono";
import { z } from "zod";

// ルートで共通に使う zod の形（入力の検証に失敗したときの 400 は server.ts の onError が返す）

/** URL の ?name= の値（なければ・空なら指定なし） */
export const queryOf = (c: Context, name: string): string | undefined => c.req.query(name) || undefined;

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
