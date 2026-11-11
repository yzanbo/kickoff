import { DB_DEFAULT_PORTS, type DbEngine, type DbSsl } from "../types/database";

// 接続の URL（postgres://user:pass@host:5432/db?sslmode=require など）を読んで、接続の登録の欄を埋める

/** URL から読んだ接続の欄（書いていないものは null） */
export interface ParsedDbUrl {
  engine: DbEngine;
  host: string | null;
  port: number | null;
  database: string | null;
  username: string | null;
  password: string | null;
  file_path: string | null;
  ssl: DbSsl | null;
}

const SCHEMES: Record<string, DbEngine> = {
  postgres: "postgres",
  postgresql: "postgres",
  mysql: "mysql",
  mariadb: "mysql",
  sqlite: "sqlite",
  sqlite3: "sqlite",
  file: "sqlite",
};

const decode = (v: string) => {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
};

/** SSL の指定（PostgreSQL の sslmode・MySQL の ssl / ssl-mode）を言葉の 3 段に寄せる */
function sslOf(params: URLSearchParams): DbSsl | null {
  const mode = (params.get("sslmode") ?? params.get("ssl-mode") ?? params.get("ssl_mode") ?? "").toLowerCase();
  const ssl = (params.get("ssl") ?? "").toLowerCase();
  const ca = params.get("sslrootcert") ?? params.get("ssl-ca") ?? null;
  if (mode === "verify-full" || mode === "verify-ca" || mode === "verify_identity" || mode === "verify_ca" || mode === "verify-identity") return { mode: "verify", ca_path: ca };
  if (mode === "require" || mode === "required" || ssl === "true" || ssl === "1" || ssl === "require") return { mode: "require", ca_path: ca };
  return null;
}

/** 接続の URL を読む（知らない形なら null）。SQLite は sqlite:path・sqlite:///abs・file:path */
export function parseDbUrl(input: string): ParsedDbUrl | null {
  const text = input.trim();
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(text)?.[1]?.toLowerCase();
  const engine = scheme ? SCHEMES[scheme.split("+")[0]] : undefined;
  if (!scheme || !engine) return null;
  if (engine === "sqlite") {
    // sqlite:///abs/path → /abs/path、sqlite://rel → rel、sqlite:rel → rel（? 以降は捨てる）
    let rest = text.slice(scheme.length + 1).split("?")[0];
    if (rest.startsWith("//")) rest = rest.slice(2);
    const file = decode(rest);
    return { engine, host: null, port: null, database: null, username: null, password: null, file_path: file || null, ssl: null };
  }
  let url: URL;
  try {
    // URL は知らない方式の host を読まないことがあるので、http に置き換えて読む
    url = new URL(`http:${text.slice(scheme.length + 1)}`);
  } catch {
    return null;
  }
  const port = url.port ? Number(url.port) : null;
  const database = decode(url.pathname.replace(/^\//, "")) || null;
  return {
    engine,
    host: decode(url.hostname).replace(/^\[|\]$/g, "") || null,
    port: port ?? DB_DEFAULT_PORTS[engine],
    database,
    username: url.username ? decode(url.username) : null,
    password: url.password ? decode(url.password) : null,
    file_path: null,
    ssl: sslOf(url.searchParams),
  };
}
