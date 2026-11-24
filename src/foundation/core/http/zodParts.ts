// 受け口で共通に使う、機能に依らない zod の部品（検証の失敗の 400 は http/app.ts の onError）
import path from "node:path";
import { z } from "zod";
import type { FormBody } from "@shared/foundation/contract";
import { expandHome } from "@/foundation/core/system/paths";

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

/** 作業場所のルート（取り決めの workdir: true）のクエリ。?worktree= は mount が作業場所に解くので受け口は読まない（ほかのクエリは extend で足す） */
export const workdirQuery = z.object({ worktree: z.string().optional() });

/** ?staged=1 などの切り替えを真偽にする（省けば fallback） */
export const flagOn = (fallback: "0" | "1") => flag.default(fallback).transform((v) => v === "1");

/** form の本文（multipart の項目をそのまま渡す。項目の中身は受け口が確かめる） */
export const formFields = z.custom<FormBody>((v) => typeof v === "object" && v !== null).transform((v) => v as unknown as Record<string, unknown>);

/** 絶対パス（~ で始めてもよい）のフォルダの指定か（ノートの親フォルダ・プロジェクトのノートのフォルダ） */
export const isAbsoluteFolder = (p: string) => path.isAbsolute(expandHome(p));
export const ABSOLUTE_FOLDER = "フォルダは / か ~ から始まる場所で指定してください";
