// 受け口で共通に使う、機能に依らない zod の部品（検証の失敗の 400 は http/app.ts の onError）
import { z } from "zod";

/** ?project_id= などの、省略できる ID（数でなければ 400。NaN を SQL に入れない） */
export const optionalId = z.coerce.number().int().positive().optional();

/** リポジトリの中のパス（ファイル・フォルダ） */
export const repoPath = z.string().min(1).max(1000);

/** 作業場所のフォルダ（ワークツリーの絶対パス） */
export const folderPath = z.string().min(1).max(2000);

/** ?staged=1 などの切り替え（"0" / "1"） */
export const flag = z.enum(["0", "1"]);

export const branchName = z.string().trim().min(1).max(200);

/** 並べ替えの ID の並び（500 まで） */
export const idsBody = z.object({ ids: z.array(z.number().int()).max(500) });
