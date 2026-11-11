import path from "node:path";
import { parseDbUrl, type ParsedDbUrl } from "@shared/database/dbUrl";
import { DB_CONNECTION_NAME_MAX, type DbEngine, type DbEnvironment, type DbImportCandidate } from "@shared/types";
import { expandHome } from "../../system/paths.js";

/** 見つけた接続の案（コアの中だけ。パスワードも持つ。画面へは DbImportCandidate にして has_password だけ） */
export type FoundDb = Omit<DbImportCandidate, "has_password" | "existing_id"> & { password: string | null };

const LOCAL_HOSTS = new Set(["localhost", "0.0.0.0", "::1", "host.docker.internal"]);

/** この Mac の中のホストか（SQLite・localhost・127.x） */
export function isLocalHost(host: string | null): boolean {
  if (!host) return true;
  const h = host.toLowerCase();
  return LOCAL_HOSTS.has(h) || h.startsWith("127.");
}

const word = (name: string, words: string) => new RegExp(`(^|[._-])(${words})([._-]|$)`).test(name.toLowerCase());

/**
 * 環境を推す: ファイルの名前が本番・ステージングならそれ（.env.production など）→ SQLite・この Mac の中のホストはローカル →
 * 名前が開発・テストなら開発 → 分からない外のホストは本番（読み取り専用・AI に見せないから始める。取り込むときに変えられる）
 */
export function guessEnvironment(fileName: string, engine: DbEngine, host: string | null): DbEnvironment {
  if (word(fileName, "production|prod")) return "production";
  if (word(fileName, "staging|stage|stg")) return "staging";
  if (engine === "sqlite" || isLocalHost(host)) return "local";
  if (word(fileName, "development|dev|test|local")) return "dev";
  return "production";
}

/** 分からない外のホストを本番にしたときの注意 */
export const REMOTE_AS_PRODUCTION = "外のホストなので、本番として取り込みます（取り込む前に変えられます）";

/** 名前の案（接続の名前の上限で切る） */
export const candidateName = (main: string, where: string) => `${main}（${where}）`.slice(0, DB_CONNECTION_NAME_MAX);

/** 同じ接続かを比べる印（SQLite は実体のパス、ほかは種類・ホスト（この Mac の中は 1 つ）・ポート・DB） */
export function identityOf(c: { engine: DbEngine; host: string | null; port: number | null; database: string | null; file_path: string | null }, root: string): string {
  if (c.engine === "sqlite") {
    const file = expandHome(c.file_path ?? "");
    return `sqlite:${path.resolve(root, file)}`;
  }
  const host = isLocalHost(c.host) ? "localhost" : (c.host ?? "").toLowerCase();
  return `${c.engine}:${host}:${c.port ?? ""}:${c.database ?? ""}`;
}

/**
 * URL（DATABASE_URL など）から案を作る。SQLite の相対パスは base（URL を書いたファイルのフォルダ。プロジェクトフォルダからの相対）からの場所にする
 */
export function fromUrl(url: string, base: string, at: Pick<FoundDb, "key" | "source" | "origin"> & { fileName: string; where: string }): FoundDb | null {
  const parsed = parseDbUrl(url);
  if (!parsed) return null;
  return fromParsed(parsed, base, at);
}

export function fromParsed(parsed: ParsedDbUrl, base: string, at: Pick<FoundDb, "key" | "source" | "origin"> & { fileName: string; where: string }): FoundDb | null {
  let file = parsed.file_path;
  if (parsed.engine === "sqlite") {
    if (!file || file === ":memory:") return null;
    if (!path.isAbsolute(file) && !file.startsWith("~")) file = path.normalize(path.join(base, file));
  }
  const environment = guessEnvironment(at.fileName, parsed.engine, parsed.host);
  const main = parsed.engine === "sqlite" ? path.basename(file ?? "") : (parsed.database ?? parsed.host ?? parsed.engine);
  return {
    key: at.key,
    source: at.source,
    origin: at.origin,
    name: candidateName(main, at.where),
    engine: parsed.engine,
    host: parsed.host,
    port: parsed.port,
    database: parsed.database,
    username: parsed.username,
    file_path: file,
    ssl: parsed.ssl,
    environment,
    password: parsed.password,
    note: environment === "production" && !isLocalHost(parsed.host) && !word(at.fileName, "production|prod") ? REMOTE_AS_PRODUCTION : null,
  };
}
