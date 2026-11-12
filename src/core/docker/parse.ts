// Docker タブの純粋な読み取り: docker ps の 1 行 1 JSON・Ports・Status・compose の config・設定の指紋・印・エンジンを開くボタン・
// 作業場所への振り分け・override と COMPOSE_FILE の選び方（テストは parse.test.ts）
import path from "node:path";
import type { DockerContainerState, DockerEngineStarter, DockerMark, DockerPort } from "@shared/types";

/** docker ps の 1 行（必要なラベルだけをテンプレートで取り出したもの） */
export interface RawContainer {
  id: string;
  name: string;
  image: string;
  state: DockerContainerState;
  status: string;
  ports: string;
  /** com.docker.compose.project（compose の外のコンテナは null） */
  project: string | null;
  service: string | null;
  /** com.docker.compose.project.working_dir */
  dir: string | null;
  /** com.docker.compose.project.config_files（カンマ区切りの絶対パス） */
  files: string[];
  oneoff: boolean;
  number: number;
  /** com.docker.compose.config-hash */
  hash: string | null;
}

/** docker ps の --format（ふつうの json はラベルを「k=v,k=v」の 1 つの文字列で返し、config_files にもカンマが入るので、必要なラベルだけ取り出す） */
export const PS_FORMAT =
  '{"id":{{json .ID}},"name":{{json .Names}},"image":{{json .Image}},"state":{{json .State}},"status":{{json .Status}},"ports":{{json .Ports}},' +
  '"project":{{json (.Label "com.docker.compose.project")}},"service":{{json (.Label "com.docker.compose.service")}},' +
  '"dir":{{json (.Label "com.docker.compose.project.working_dir")}},"files":{{json (.Label "com.docker.compose.project.config_files")}},' +
  '"oneoff":{{json (.Label "com.docker.compose.oneoff")}},"number":{{json (.Label "com.docker.compose.container-number")}},' +
  '"hash":{{json (.Label "com.docker.compose.config-hash")}}}';

const CONTAINER_STATES: readonly DockerContainerState[] = ["created", "running", "paused", "restarting", "removing", "exited", "dead"];
const orNull = (v: unknown) => (typeof v === "string" && v !== "" ? v : null);

/** docker ps の出力（1 行 1 JSON）を読む。読めない行は飛ばす */
export function parsePs(out: string): RawContainer[] {
  const list: RawContainer[] = [];
  for (const line of out.split("\n")) {
    if (!line.trim()) continue;
    let o: Record<string, unknown>;
    try {
      o = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (typeof o.id !== "string") continue;
    const state = CONTAINER_STATES.includes(o.state as DockerContainerState) ? (o.state as DockerContainerState) : "exited";
    const files = orNull(o.files);
    list.push({
      id: o.id,
      name: typeof o.name === "string" ? o.name : o.id,
      image: typeof o.image === "string" ? o.image : "",
      state,
      status: typeof o.status === "string" ? o.status : "",
      ports: typeof o.ports === "string" ? o.ports : "",
      project: orNull(o.project),
      service: orNull(o.service),
      dir: orNull(o.dir),
      files: files ? files.split(",").filter(Boolean) : [],
      oneoff: String(o.oneoff).toLowerCase() === "true",
      number: Number.parseInt(String(o.number ?? ""), 10) || 1,
      hash: orNull(o.hash),
    });
  }
  return list;
}

/**
 * Ports の文字列から Mac に出しているものだけを読む（「0.0.0.0:5432->5432/tcp, [::]:5432->5432/tcp, 6379/tcp」。
 * IPv4 と IPv6 の同じ番号は 1 つに、範囲「8000-8001->8000-8001」は 1 つずつに）
 */
export function parsePorts(ports: string): DockerPort[] {
  const found: DockerPort[] = [];
  for (const part of ports.split(",")) {
    const m = /^\s*(.*):(\d+)(?:-(\d+))?->(\d+)(?:-\d+)?\/(\w+)\s*$/.exec(part);
    if (!m) continue;
    const [, rawIp, from, to, target, protocol] = m;
    const hostIp = rawIp.replace(/^\[|\]$/g, "") || "::";
    const start = Number(from);
    const end = to ? Number(to) : start;
    for (let p = start; p <= end && p - start < 1000; p++) {
      const containerPort = Number(target) + (p - start);
      if (found.some((f) => f.host_port === p && f.protocol === protocol)) continue;
      found.push({ host_ip: hostIp, host_port: p, container_port: containerPort, protocol });
    }
  }
  return found;
}

/** Status の文から終了コードとヘルスチェックの様子を読む（「Exited (1) 3 minutes ago」「Up 2 hours (unhealthy)」） */
export function parseStatus(status: string): { exitCode: number | null; health: "healthy" | "unhealthy" | "starting" | null } {
  const exit = /Exited \((-?\d+)\)/.exec(status);
  const health = /\((healthy|unhealthy|health: starting)\)/.exec(status)?.[1];
  return {
    exitCode: exit ? Number(exit[1]) : null,
    health: health === "health: starting" ? "starting" : health === "healthy" || health === "unhealthy" ? health : null,
  };
}

/** compose の config --format json から使うもの */
export interface ComposeConfig {
  name: string;
  services: { name: string; image: string | null; profiles: string[]; published: number[] }[];
}

/** docker compose … config --format json を読む（読めなければ null） */
export function parseComposeConfig(out: string): ComposeConfig | null {
  let o: { name?: unknown; services?: unknown };
  try {
    o = JSON.parse(out) as typeof o;
  } catch {
    return null;
  }
  if (typeof o.name !== "string" || !o.services || typeof o.services !== "object") return null;
  const services = Object.entries(o.services as Record<string, Record<string, unknown>>).map(([name, svc]) => {
    const ports = Array.isArray(svc.ports) ? (svc.ports as Record<string, unknown>[]) : [];
    const published = [...new Set(ports.map((p) => Number.parseInt(String(p.published ?? ""), 10)).filter((n) => Number.isInteger(n) && n > 0))];
    return {
      name,
      image: typeof svc.image === "string" ? svc.image : null,
      profiles: Array.isArray(svc.profiles) ? svc.profiles.filter((p): p is string => typeof p === "string") : [],
      published,
    };
  });
  return { name: o.name, services: services.sort((a, b) => a.name.localeCompare(b.name)) };
}

/** config --hash '*' の出力（「サービス名 指紋」の 1 行ずつ） */
export function parseConfigHashes(out: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of out.split("\n")) {
    const [name, hash] = line.trim().split(/\s+/);
    if (name && hash) map.set(name, hash);
  }
  return map;
}

/** サービスの行の印（全部動いていれば running。一部でも動いていれば running に数を添える。異常に終わったものが動いているものより先） */
export function serviceMark(containers: { state: DockerContainerState; exitCode: number | null; health: string | null }[]): DockerMark {
  if (containers.length === 0) return "none";
  if (containers.some((c) => c.state === "paused")) return "paused";
  if (containers.some((c) => c.state === "restarting" || c.state === "removing" || c.health === "starting")) return "starting";
  if (containers.some((c) => c.health === "unhealthy" || c.state === "dead" || (c.state === "exited" && c.exitCode !== null && c.exitCode !== 0))) return "failed";
  if (containers.some((c) => c.state === "running")) return "running";
  if (containers.every((c) => c.state === "created")) return "created";
  return "stopped";
}

/** エンジンが止まっているときのボタン（context の名前から。分からない名前は出さない） */
export function starterOf(context: string | null): DockerEngineStarter {
  if (context === "orbstack") return { kind: "open", app: "OrbStack", label: "OrbStack を開く" };
  if (context === "desktop-linux") return { kind: "open", app: "Docker", label: "Docker Desktop を開く" };
  if (context === "colima" || context?.startsWith("colima-")) return { kind: "copy", command: context === "colima" ? "colima start" : `colima start --profile ${context.slice(7)}` };
  return null;
}

/** フォルダ dir を、いちばん深く含む作業場所（パスはどちらも realpath でそろえたもの。なければ undefined） */
export function deepestWorkplace<T extends { path: string }>(dir: string, workplaces: readonly T[]): T | undefined {
  let best: T | undefined;
  for (const w of workplaces) {
    const inside = dir === w.path || dir.startsWith(w.path.endsWith("/") ? w.path : `${w.path}/`);
    if (inside && (!best || w.path.length > best.path.length)) best = w;
  }
  return best;
}

/** 決まった名前の compose のファイル（override を重ねる・2 段下まで探すのはこの 4 つだけ） */
export const STANDARD_COMPOSE_NAMES = ["compose.yaml", "compose.yml", "docker-compose.yaml", "docker-compose.yml"] as const;

/** 直下の別名（compose.e2e.yaml など）か。override は別の compose として出さない */
export function isAltComposeName(name: string): boolean {
  if (/\.override\.ya?ml$/.test(name)) return false;
  return /^(docker-)?compose\.[^/]+\.ya?ml$/.test(name);
}

/** 決まった名前の compose に重ねる override のファイル名（同じ系統の名前。別名の compose には重ねない） */
export function overrideNamesFor(file: string): string[] {
  const name = path.basename(file);
  if (!(STANDARD_COMPOSE_NAMES as readonly string[]).includes(name)) return [];
  const docker = name.startsWith("docker-");
  return docker ? ["docker-compose.override.yaml", "docker-compose.override.yml"] : ["compose.override.yaml", "compose.override.yml"];
}

/** .env の中身から COMPOSE_FILE の並び（絶対パス）を読み、見つけたファイルがその中にあれば返す（なければ null） */
export function composeFilesFromEnv(envText: string, file: string): string[] | null {
  const vars = new Map<string, string>();
  for (const raw of envText.split("\n")) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(raw);
    if (!m) continue;
    vars.set(m[1], m[2].replace(/^(['"])(.*)\1$/, "$2"));
  }
  const list = vars.get("COMPOSE_FILE");
  if (!list) return null;
  const dir = path.dirname(file);
  const files = list
    .split(vars.get("COMPOSE_PATH_SEPARATOR") || ":")
    .filter(Boolean)
    .map((f) => path.resolve(dir, f));
  return files.includes(file) ? files : null;
}

/** DB クライアントで開けるイメージか */
export function dbKindOf(image: string | null): "postgres" | "mysql" | null {
  const name = (image ?? "").split("/").pop()?.split(":")[0] ?? "";
  if (/postgres|postgis|timescale/.test(name)) return "postgres";
  if (/mysql|mariadb/.test(name)) return "mysql";
  return null;
}

