// ポートの取り合いの純粋な関数: up の失敗の文からぶつかったポート・Docker 同士の相手・静かなぶつかり（lsof）・Homebrew のサービス
import type { DockerPortConflict, DockerSilentConflict } from "@shared/types";
import type { RawContainer } from "./parse.js";
import { parsePorts } from "./parse.js";

/** Docker のエンジンのプロセスの名前（これらだけがポートを待っているなら、ぶつかりではない） */
export const DOCKER_ENGINE_PROCESSES = ["OrbStack", "OrbStack Helper", "com.docker.backend", "com.docker.vpnkit", "vpnkit-bridge", "limactl", "gvproxy"] as const;

/**
 * up の失敗の標準エラーから、ぶつかったポート（なければ null）。「Bind for 0.0.0.0:5432 failed: port is already allocated」（アドレスは決め打ちしない）と、
 * Docker の外のプロセスが先に待っていたときの「listen tcp 127.0.0.1:5432: bind: address already in use」。エラー文に出るのは最初の 1 つだけ
 */
export function allocatedPortOf(stderr: string): number | null {
  const m = /Bind for \S*:(\d+) failed: port is already allocated/.exec(stderr) ?? /\S*:(\d+): bind: address already in use/.exec(stderr);
  return m ? Number(m[1]) : null;
}

/** コンテナの Mac に出しているポート */
export const hostPortsOf = (c: Pick<RawContainer, "ports">) => [...new Set(parsePorts(c.ports).map((p) => p.host_port))];

/**
 * ポートの取り合いの相手（Docker 同士）: compose の Mac に出すポート（published）のどれかを、この compose のものでない動いているコンテナが出しているもの。
 * labelOf で相手の説明（「本体 | main の db」など）を決める
 */
export function portConflictsOf(
  published: readonly number[],
  containers: readonly RawContainer[],
  isOwn: (c: RawContainer) => boolean,
  labelOf: (c: RawContainer) => string,
): DockerPortConflict[] {
  const wanted = new Set(published);
  return containers
    .filter((c) => c.state === "running" && !isOwn(c))
    .flatMap((c) => hostPortsOf(c).filter((p) => wanted.has(p)).map((port) => ({ port, container_id: c.id, container_name: c.name, label: labelOf(c) })))
    .sort((a, b) => a.port - b.port);
}

/** lsof の待っているポート 1 つ */
export interface ListeningSocket {
  process: string;
  pid: number;
  /** 127.0.0.1:5432・*:5432・[::1]:5432 など（lsof に出たまま） */
  address: string;
  port: number;
}

/** lsof の名前の \xNN（空白など）を戻す */
const unescapeLsof = (s: string) => s.replace(/\\x([0-9a-fA-F]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));

/** `lsof -nP +c 0 -iTCP -sTCP:LISTEN` の出力を読む（見出しの行と読めない行は飛ばす） */
export function parseLsof(out: string): ListeningSocket[] {
  const sockets: ListeningSocket[] = [];
  for (const line of out.split("\n")) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 9 || cols[0] === "COMMAND") continue;
    const pid = Number(cols[1]);
    const name = cols.slice(8).join(" ").replace(/\s*\(LISTEN\)$/, "");
    const m = /:(\d+)$/.exec(name);
    if (!Number.isInteger(pid) || !m) continue;
    sockets.push({ process: unescapeLsof(cols[0]), pid, address: name, port: Number(m[1]) });
  }
  return sockets;
}

/**
 * 静かなぶつかり: そのポートを待つプロセスが PID で 2 つ以上あり、そのうち Docker のエンジンでないもの（エンジン 1 つだけなら出さない）。
 * brewByPid は Homebrew のサービスの PID → 名前
 */
export function silentConflictsOf(ports: readonly number[], sockets: readonly ListeningSocket[], brewByPid: ReadonlyMap<number, string> = new Map()): DockerSilentConflict[] {
  const engines = new Set<string>(DOCKER_ENGINE_PROCESSES);
  const out: DockerSilentConflict[] = [];
  for (const port of new Set(ports)) {
    const here = sockets.filter((s) => s.port === port);
    if (new Set(here.map((s) => s.pid)).size < 2) continue;
    const seen = new Set<number>();
    for (const s of here) {
      if (engines.has(s.process) || seen.has(s.pid)) continue;
      seen.add(s.pid);
      out.push({ port, address: s.address, process: s.process, pid: s.pid, brew_service: brewByPid.get(s.pid) ?? null });
    }
  }
  return out;
}

/** `brew services info --all --json` の出力から、動いているサービスの PID → 名前（読めなければ空） */
export function brewServicePids(out: string): Map<number, string> {
  const map = new Map<number, string>();
  try {
    const list: unknown = JSON.parse(out);
    if (!Array.isArray(list)) return map;
    for (const item of list) {
      const { name, pid } = (item ?? {}) as { name?: unknown; pid?: unknown };
      if (typeof name === "string" && typeof pid === "number" && pid > 0) map.set(pid, name);
    }
  } catch {
    // 形が違えば、Homebrew のサービスとは見なさない（止めるボタンを出さないだけ）
  }
  return map;
}

/** 相手の説明（「本体 | main の db」「WT | feat-x の db」「other（ほかのプロジェクト）の db」「kickoff-dbtest-pg（compose の外で作ったコンテナ）」） */
export function conflictLabel(
  c: Pick<RawContainer, "id" | "name" | "project" | "service" | "dir">,
  composeOf: (id: string) => { worktree_path: string | null; branch: string | null } | undefined,
): string {
  const mine = composeOf(c.id);
  if (mine) {
    const place = mine.worktree_path === null ? `本体${mine.branch ? ` | ${mine.branch}` : ""}` : `WT | ${mine.branch ?? mine.worktree_path.split("/").pop()}`;
    return `${place} の ${c.service ?? c.name}`;
  }
  if (c.project) return `${c.dir ? c.dir.split("/").pop() : c.project}（ほかのプロジェクト）の ${c.service ?? c.name}`;
  return `${c.name}（compose の外で作ったコンテナ）`;
}
