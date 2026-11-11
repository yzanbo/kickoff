import path from "node:path";
import type { DbEngine } from "@shared/types";
import { fromUrl, type FoundDb } from "./found.js";

/** Prisma の provider → 種類（sqlserver・mongodb などは扱わない） */
const PRISMA_ENGINES: Record<string, DbEngine> = { postgresql: "postgres", postgres: "postgres", mysql: "mysql", sqlite: "sqlite" };

/** Prisma の datasource の url（env("NAME") なら名前、"…" ならそのまま） */
export type PrismaUrl = { env: string } | { literal: string };

/** schema.prisma の datasource の provider と url（なければ null） */
export function parsePrismaSchema(text: string): { engine: DbEngine | null; url: PrismaUrl | null } | null {
  const block = /datasource\s+\w+\s*\{([\s\S]*?)\}/.exec(text.replace(/\/\/.*$/gm, ""))?.[1];
  if (block === undefined) return null;
  const provider = /provider\s*=\s*"([^"]+)"/.exec(block)?.[1]?.toLowerCase() ?? "";
  const env = /url\s*=\s*env\(\s*"([^"]+)"\s*\)/.exec(block)?.[1];
  const literal = /url\s*=\s*"([^"]+)"/.exec(block)?.[1];
  return { engine: PRISMA_ENGINES[provider] ?? null, url: env ? { env } : literal ? { literal } : null };
}

/**
 * prisma.config.ts（Prisma 7）の schema の場所と datasource の url（env("NAME")・process.env.NAME・"…"）。
 * 書き方が自由なので、よくある形だけを読む
 */
export function parsePrismaConfig(text: string): { schema: string | null; url: PrismaUrl | null } {
  const code = text.replace(/\/\/.*$/gm, "");
  const schema = /schema\s*:\s*["'`]([^"'`]+)["'`]/.exec(code)?.[1] ?? null;
  const ds = /datasource\s*:\s*\{([\s\S]*?)\}/.exec(code)?.[1] ?? "";
  const m = /url\s*:\s*(?:env\(\s*["'`](\w+)["'`]\s*\)|process\.env\.(\w+)|process\.env\[\s*["'`](\w+)["'`]\s*\]|["'`]([^"'`]+)["'`])/.exec(ds);
  const env = m?.[1] ?? m?.[2] ?? m?.[3];
  return { schema, url: env ? { env } : m?.[4] ? { literal: m[4] } : null };
}

/**
 * Prisma の datasource から案を作る。url が env なら vars（プロジェクトフォルダの .env）から引く。
 * SQLite の file:./dev.db は url を書いたファイル（fileRel）のフォルダからの場所。provider と URL の種類が違えば作らない
 */
export function candidateFromPrisma(fileRel: string, engine: DbEngine | null, url: PrismaUrl, vars: Map<string, string>): FoundDb | null {
  const value = "env" in url ? vars.get(url.env) : url.literal;
  if (!value) return null;
  const via = "env" in url ? `（.env の ${url.env}）` : "";
  const c = fromUrl(value, path.dirname(fileRel), { key: `prisma:${fileRel}`, source: "prisma", origin: `${fileRel} の datasource${via}`, fileName: ".env", where: "Prisma" });
  if (!c || (engine && c.engine !== engine)) return null;
  return c;
}
