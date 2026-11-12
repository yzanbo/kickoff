import fs from "node:fs/promises";
import path from "node:path";
import type { DbConnection, DbImportCandidate } from "@shared/types";
import { expandHome } from "../../system/paths.js";
import { parseEnvFile } from "./envFile.js";
import { candidatesFromCompose, type ComposeHosts } from "./fromCompose.js";
import { candidatesFromEnv } from "./fromEnv.js";
import { candidateFromPrisma, parsePrismaConfig, parsePrismaSchema, type PrismaUrl } from "./fromPrisma.js";
import { findSqliteFiles } from "./sqliteFiles.js";
import { candidateName, guessEnvironment, identityOf, type FoundDb } from "./found.js";

// プロジェクトから DB の接続を取り込む（要件 5.12 の段階 2）: .env の DATABASE_URL など・docker compose の DB のサービス・
// Prisma の設定・SQLite のファイルを探して案にする。読むだけで、プロジェクトの中は変えない

const TEXT_MAX = 1024 * 1024;
const COMPOSE_FILES = ["compose.yaml", "compose.yml", "docker-compose.yml", "docker-compose.yaml"];
const PRISMA_CONFIGS = ["prisma.config.ts", "prisma.config.mts", "prisma.config.js", "prisma.config.mjs"];
const PRISMA_SCHEMAS = ["prisma/schema.prisma", "schema.prisma"];
/** 見本の .env（値は仮のもの）は読まない */
const ENV_SAMPLE = /\.(example|sample|template|dist|defaults?)$/i;

async function readText(file: string): Promise<string | null> {
  try {
    const stat = await fs.stat(file);
    if (!stat.isFile() || stat.size > TEXT_MAX) return null;
    return await fs.readFile(file, "utf8");
  } catch {
    return null;
  }
}

/** プロジェクトフォルダの一番上の .env たち（.env を先に、ほかは名前の順） */
async function envFiles(root: string): Promise<string[]> {
  const names = await fs.readdir(root).catch(() => [] as string[]);
  return names.filter((n) => /^\.env(\..+)?$/.test(n) && !ENV_SAMPLE.test(n)).sort((a, b) => (a === ".env" ? -1 : b === ".env" ? 1 : a.localeCompare(b)));
}

/** Prisma の datasource（prisma.config.ts の url を先に、なければ schema.prisma の url） */
async function prismaCandidates(root: string, vars: Map<string, string>): Promise<{ found: FoundDb[]; usedEnv: Set<string> }> {
  const usedEnv = new Set<string>();
  let config: { file: string; schema: string | null; url: PrismaUrl | null } | null = null;
  for (const name of PRISMA_CONFIGS) {
    const text = await readText(path.join(root, name));
    if (text !== null) {
      config = { file: name, ...parsePrismaConfig(text) };
      break;
    }
  }
  const schemaFiles = config?.schema ? [config.schema] : [...PRISMA_SCHEMAS];
  const multi = await fs.readdir(path.join(root, "prisma/schema")).catch(() => [] as string[]);
  schemaFiles.push(...multi.filter((n) => n.endsWith(".prisma")).map((n) => `prisma/schema/${n}`));
  let schema: { file: string; parsed: NonNullable<ReturnType<typeof parsePrismaSchema>> } | null = null;
  for (const file of schemaFiles) {
    const text = await readText(path.join(root, file));
    const parsed = text === null ? null : parsePrismaSchema(text);
    if (parsed) {
      schema = { file: path.normalize(file), parsed };
      break;
    }
  }
  if (!config && !schema) return { found: [], usedEnv };
  const url = config?.url ?? schema?.parsed.url ?? null;
  const urlFile = config?.url ? config.file : schema?.file;
  if (!url || !urlFile) return { found: [], usedEnv };
  if ("env" in url) usedEnv.add(url.env);
  const c = candidateFromPrisma(urlFile, schema?.parsed.engine ?? null, url, vars);
  return { found: c ? [c] : [], usedEnv };
}

/** .env・Prisma の URL のホストが compose のサービス名なら、この Mac から入る localhost とポートに読み替える */
function mapComposeHost(c: FoundDb, hosts: ComposeHosts, fileName: string): FoundDb {
  if (c.engine === "sqlite" || !c.host || !hosts.has(c.host)) return c;
  const port = hosts.get(c.host) ?? null;
  if (port === null) return { ...c, note: `compose の中の名前「${c.host}」なので、この Mac からはつなげないかもしれません（compose で ports を外に出してください）` };
  const environment = guessEnvironment(fileName, c.engine, "localhost");
  return { ...c, host: "localhost", port, environment, note: `compose のサービス名「${c.host}」を localhost:${port} に読み替えました` };
}

/** プロジェクトの中の接続の案（同じ接続は最初に見つけたものだけ。allowFile が false の SQLite は除く） */
export async function scanProjectDbs(root: string, allowFile: (absolute: string) => boolean): Promise<FoundDb[]> {
  const envs: { name: string; vars: Map<string, string> }[] = [];
  for (const name of await envFiles(root)) {
    const text = await readText(path.join(root, name));
    if (text !== null) envs.push({ name, vars: parseEnvFile(text) });
  }
  const rootVars = envs.find((e) => e.name === ".env")?.vars ?? new Map<string, string>();

  const hosts: ComposeHosts = new Map();
  const compose: FoundDb[] = [];
  // yaml は取り込みを開いたときだけ読む（メインプロセスの起動で読み込まない）
  const { parse: parseYaml } = await import("yaml");
  for (const name of COMPOSE_FILES) {
    const text = await readText(path.join(root, name));
    if (text === null) continue;
    let doc: unknown;
    try {
      doc = parseYaml(text);
    } catch {
      continue;
    }
    compose.push(...candidatesFromCompose(name, doc, rootVars, hosts));
  }

  const prisma = await prismaCandidates(root, rootVars);
  const fromEnvs = envs.flatMap((e) => candidatesFromEnv(e.name, e.vars, e.name === ".env" ? prisma.usedEnv : undefined).map((c) => mapComposeHost(c, hosts, e.name)));
  const prismaFound = prisma.found.map((c) => mapComposeHost(c, hosts, ".env"));
  const files: FoundDb[] = (await findSqliteFiles(root)).map((rel) => ({
    key: `file:${rel}`,
    source: "file",
    origin: rel,
    name: candidateName(path.basename(rel), "ファイル"),
    engine: "sqlite",
    host: null,
    port: null,
    database: null,
    username: null,
    file_path: rel,
    ssl: null,
    environment: "local",
    password: null,
    note: null,
  }));

  const seen = new Set<string>();
  const result: FoundDb[] = [];
  for (const c of [...prismaFound, ...fromEnvs, ...compose, ...files]) {
    const id = identityOf(c, root);
    if (seen.has(id)) continue;
    seen.add(id);
    if (c.engine === "sqlite") {
      const absolute = path.resolve(root, expandHome(c.file_path ?? ""));
      if (!allowFile(absolute)) continue;
      const exists = await fs.stat(absolute).then((s) => s.isFile(), () => false);
      if (!exists && !c.note) result.push({ ...c, note: "ファイルがまだありません（アプリを動かすと作られます）" });
      else result.push(c);
      continue;
    }
    result.push(c);
  }
  return result;
}

/** 画面へ返す形（パスワードは返さず、あるかだけ。同じ接続がもう登録してあれば、その接続） */
export function toImportCandidates(found: FoundDb[], existing: DbConnection[], root: string): DbImportCandidate[] {
  const ids = new Map(existing.map((c) => [identityOf(c, root), c.id]));
  return found.map(({ password, ...c }) => ({ ...c, has_password: Boolean(password), existing_id: ids.get(identityOf(c, root)) ?? null }));
}
