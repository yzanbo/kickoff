import { DB_DEFAULT_PORTS, type DbEngine } from "@shared/database/types";
import { interpolate } from "./envFile";
import { candidateName, type FoundDb } from "./found";

/** compose のサービス名 → この Mac から入る localhost のポート（外に出していなければ null） */
export type ComposeHosts = Map<string, number | null>;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** compose の DB のイメージの読み方（イメージの名前・中のポートの変数・ログインの環境変数）。種類の if を書かずに、ここを引く */
interface ComposeImage {
  engine: DbEngine;
  /** イメージの名前（postgres・postgis・timescaledb・mysql・mariadb。bitnami なども） */
  name: RegExp;
  /** 中で待つポートを変える環境変数 */
  portEnv: string;
  login(env: Map<string, string>): { username: string; database: string | null; password: string | null };
}

const COMPOSE_IMAGES: ComposeImage[] = [
  {
    engine: "postgres",
    name: /postgres|postgis|timescale/,
    portEnv: "PGPORT",
    login: (env) => {
      const username = env.get("POSTGRES_USER") || "postgres";
      return { username, database: env.get("POSTGRES_DB") || username, password: env.get("POSTGRES_PASSWORD") || null };
    },
  },
  {
    engine: "mysql",
    name: /mysql|mariadb/,
    portEnv: "MYSQL_TCP_PORT",
    login: (env) => {
      const user = env.get("MYSQL_USER") || env.get("MARIADB_USER") || null;
      return {
        username: user ?? "root",
        database: env.get("MYSQL_DATABASE") || env.get("MARIADB_DATABASE") || null,
        password: (user ? env.get("MYSQL_PASSWORD") || env.get("MARIADB_PASSWORD") : env.get("MYSQL_ROOT_PASSWORD") || env.get("MARIADB_ROOT_PASSWORD")) || null,
      };
    },
  },
];

/** イメージの名前から DB のイメージの読み方（DB でなければ null） */
function composeImage(image: string): ComposeImage | null {
  const name = image.toLowerCase().split("@")[0].split(":")[0];
  return COMPOSE_IMAGES.find((i) => i.name.test(name)) ?? null;
}

/** environment（{ K: V } か ["K=V"]）を読む */
function environmentOf(raw: unknown, lookup: (name: string) => string | undefined): Map<string, string> {
  const env = new Map<string, string>();
  const put = (k: string, v: unknown) => {
    if (v === null || v === undefined) return;
    env.set(k, interpolate(String(v), lookup));
  };
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const s = String(item);
      const eq = s.indexOf("=");
      if (eq > 0) put(s.slice(0, eq), s.slice(eq + 1));
    }
  } else if (isObject(raw)) for (const [k, v] of Object.entries(raw)) put(k, v);
  return env;
}

/** ports から、中のポート（5432 など）を外に出している localhost のポート（"5433:5432"・"127.0.0.1:5433:5432/tcp"・{ target, published }） */
export function publishedPort(ports: unknown, target: number, lookup: (name: string) => string | undefined): number | null {
  if (!Array.isArray(ports)) return null;
  for (const p of ports) {
    if (isObject(p)) {
      if (Number(p.target) === target && p.published !== undefined) {
        const n = Number(interpolate(String(p.published), lookup));
        if (Number.isInteger(n) && n > 0) return n;
      }
      continue;
    }
    const parts = interpolate(String(p), lookup).replace(/\/(tcp|udp)$/, "").split(":");
    if (parts.length < 2) continue;
    const inner = Number(parts[parts.length - 1]);
    const outer = Number(parts[parts.length - 2]);
    if (inner === target && Number.isInteger(outer) && outer > 0) return outer;
  }
  return null;
}

/**
 * compose.yaml / docker-compose.yml を読んだもの（doc）から、DB のサービスの案を作る。${VAR} は vars（compose と同じく .env）で埋める。
 * つなぎ先はこの Mac から入る localhost と外に出したポート。hosts にサービス名とそのポートを入れる（.env の URL のホストの読み替えに使う）
 */
export function candidatesFromCompose(fileRel: string, doc: unknown, vars: Map<string, string>, hosts: ComposeHosts): FoundDb[] {
  const services = isObject(doc) && isObject(doc.services) ? doc.services : {};
  const lookup = (name: string) => vars.get(name);
  const found: FoundDb[] = [];
  for (const [service, raw] of Object.entries(services)) {
    if (!isObject(raw) || typeof raw.image !== "string") continue;
    const image = composeImage(interpolate(raw.image, lookup));
    if (!image) continue;
    const { engine } = image;
    const env = environmentOf(raw.environment, lookup);
    const target = Number(env.get(image.portEnv)) || (DB_DEFAULT_PORTS[engine] as number);
    const port = publishedPort(raw.ports, target, lookup);
    hosts.set(service, port);
    if (typeof raw.container_name === "string") hosts.set(raw.container_name, port);
    const { username, database, password } = image.login(env);
    found.push({
      key: `compose:${fileRel}:${service}`,
      source: "compose",
      origin: `${fileRel} のサービス ${service}`,
      name: candidateName(database ?? service, "compose"),
      engine,
      host: "localhost",
      port: port ?? target,
      database,
      username,
      file_path: null,
      ssl: null,
      environment: "local",
      password,
      note: port === null ? "ports で外に出していないので、このままでは Mac からつなげません（compose に ports を足してください）" : null,
    });
  }
  return found;
}
