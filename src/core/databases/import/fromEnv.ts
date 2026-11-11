import { DB_DEFAULT_PORTS, type DbEngine } from "@shared/types";
import { fromParsed, fromUrl, type FoundDb } from "./found.js";

/** 接続の URL を入れる名前（DATABASE_URL・POSTGRES_URL・DB_DSN・PRIMARY_DATABASE_URL・Prisma の DIRECT_URL など） */
const URL_KEY = /(DATABASE|DB|POSTGRES|POSTGRESQL|PG|MYSQL|MARIADB|SQLITE)\w*_(URL|URI|DSN)$|^DIRECT_URL$/i;

/** Laravel の DB_CONNECTION の値 → 種類 */
const LARAVEL_ENGINES: Record<string, DbEngine> = { mysql: "mysql", mariadb: "mysql", pgsql: "postgres", sqlite: "sqlite" };

/**
 * .env の値から接続の案を作る: 接続の URL の名前（URL_KEY）と、Laravel の DB_CONNECTION ＋ DB_HOST などの組。
 * skip は Prisma の設定が使っている名前（SQLite の相対パスの基準が違うので、Prisma の方で作る）
 */
export function candidatesFromEnv(fileRel: string, vars: Map<string, string>, skip: ReadonlySet<string> = new Set()): FoundDb[] {
  const found: FoundDb[] = [];
  for (const [key, value] of vars) {
    if (!URL_KEY.test(key) || skip.has(key) || !value) continue;
    const c = fromUrl(value, ".", { key: `env:${fileRel}:${key}`, source: "env", origin: `${fileRel} の ${key}`, fileName: fileRel, where: fileRel });
    if (c) found.push(c);
  }
  const laravel = LARAVEL_ENGINES[(vars.get("DB_CONNECTION") ?? "").toLowerCase()];
  if (laravel) {
    const at = { key: `env:${fileRel}:DB_CONNECTION`, source: "env" as const, origin: `${fileRel} の DB_CONNECTION・DB_HOST など`, fileName: fileRel, where: fileRel };
    const port = Number(vars.get("DB_PORT"));
    const c =
      laravel === "sqlite"
        ? fromParsed({ engine: "sqlite", host: null, port: null, database: null, username: null, password: null, file_path: vars.get("DB_DATABASE") || "database/database.sqlite", ssl: null }, ".", at)
        : fromParsed(
            {
              engine: laravel,
              host: vars.get("DB_HOST") || "127.0.0.1",
              port: Number.isInteger(port) && port > 0 ? port : DB_DEFAULT_PORTS[laravel],
              database: vars.get("DB_DATABASE") || null,
              username: vars.get("DB_USERNAME") || null,
              password: vars.get("DB_PASSWORD") || null,
              file_path: null,
              ssl: null,
            },
            ".",
            at,
          );
    if (c) found.push(c);
  }
  return found;
}
