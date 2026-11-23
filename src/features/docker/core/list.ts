// Docker タブの読み: 一覧のもと（エンジンの様子・compose の見出し・ほかのプロジェクトの数・静かなぶつかり）と、コンテナ・compose の組の名前・ログの読み。
// 一覧のもとは同時の頼みを 1 回にまとめ、1 秒だけ覚える（操作の前後・docker events の変化で捨てる。エンジンが使えないときは覚えない）
import fs from "node:fs";
import path from "node:path";
import type { DockerCompose, DockerFailure, DockerList, DockerLogLine, DockerLogSource, DockerOperation } from "@shared/docker/types";
import type { Project } from "@shared/projects/types";
import { deepestWorkplace, workplacesOf, type Workplace } from "@/foundation/core/workplace/worktrees";
import { Invalid, NotFound } from "@/foundation/core/errors";
import { realPathOrSelf } from "@/foundation/core/system/paths";
import { ttlCache } from "@/foundation/core/system/ttlCache";
import type { DockerCli } from "./cli";
import { findComposeFiles, upFilesFor, type ComposeConfigCache } from "./compose";
import type { DockerEngineStarters } from "./engine";
import { buildDockerList, headFileOf, logSourcesOf, type ComposeEntry } from "./listing";
import { DOCKER_LOG_TAIL, readLog } from "./logs";
import { PS_FORMAT, parsePs, type RawContainer } from "./parse";
import { hostPortsOf } from "./portConflict";
import type { DockerPorts } from "./ports";

/** 一覧のもとを覚える時間（操作の確かめと SSE の取り直しが続けて読むのを 1 回にする） */
const SNAPSHOT_TTL_MS = 1_000;

/** 一覧を作ったときの中身（操作で compose を引き当てる）。操作の様子は読むたびに重ねる */
export interface Snapshot {
  list: DockerList;
  containers: RawContainer[];
  owner: Map<string, string>;
  upFiles: Map<string, string[]>;
}

/** 「DB で開く」の材料（compose に聞いた設定と、本体の同じサービスのポート）。案にするのは database */
export interface DockerDbSource {
  compose: Pick<DockerCompose, "key" | "file" | "worktree_path" | "branch">;
  service: string;
  doc: unknown;
  mainPort: number | null;
}

/** 動いている操作と残した失敗（compose のキーごと。DockerOperations が持つ） */
export type ComposeStateOf = (key: string) => { operation: DockerOperation | null; failure: DockerFailure | null };

/** エンジンが使えなければ投げる（入っていない / 動いていない） */
export function requireEngine(snap: Snapshot): void {
  if (snap.list.engine !== "ok") throw new Invalid(snap.list.engine === "missing" ? "Docker が入っていません" : "Docker が動いていません");
}

const pathExists = (p: string) => fs.existsSync(p);

export class DockerLister {
  private readonly snapshots = ttlCache<number, Snapshot>({ ms: SNAPSHOT_TTL_MS, max: 32 });
  /** 操作の様子（作るときに DockerOperations がつなぐ） */
  stateOf: ComposeStateOf = () => ({ operation: null, failure: null });

  constructor(
    readonly cli: DockerCli,
    readonly configs: ComposeConfigCache,
    private readonly ports: DockerPorts,
    readonly engine: DockerEngineStarters,
  ) {}

  /** 覚えた一覧のもとを捨てる（操作を始めた・終えた・docker events が変化を知らせた） */
  invalidate(projectId: number) {
    this.snapshots.invalidate(projectId);
  }

  /** ［↻］: 覚えた compose の設定と一覧のもとを捨てる */
  refresh() {
    this.configs.clear();
    this.snapshots.clear();
  }

  /** 一覧（いまの操作の様子を重ねる） */
  async list(project: Project): Promise<DockerList> {
    return (await this.snapshot(project)).list;
  }

  /** 一覧のもと（同時の頼みは 1 回・1 秒覚える）に、いまの操作の様子を重ねたもの */
  async snapshot(project: Project): Promise<Snapshot> {
    const snap = await this.snapshots.getOrLoad(project.id, () => this.load(project));
    // エンジンが使えないときは覚えない（起こしたらすぐ分かるように。調べるのは軽い）
    if (snap.list.engine !== "ok") this.snapshots.invalidate(project.id);
    return { ...snap, list: { ...snap.list, composes: snap.list.composes.map((c) => ({ ...c, ...this.stateOf(c.key) })) } };
  }

  /** コンテナの一覧（compose のフォルダ・ファイルは realpath。docker ps が失敗したら投げる） */
  async containers({ timeoutMs }: { timeoutMs: number }): Promise<RawContainer[]> {
    const out = await this.cli.run(["ps", "-a", "--format", PS_FORMAT], { timeout: timeoutMs });
    return parsePs(out).map((c) => ({ ...c, dir: c.dir ? realPathOrSelf(c.dir) : null, files: c.files.map((f) => realPathOrSelf(f)) }));
  }

  /** プロジェクトの本体とワークツリー（パスは realpath） */
  workplaces(project: Project): Promise<Workplace[]> {
    return workplacesOf(project.repo_path);
  }

  /** 作業場所ごとの compose が答える組の名前（覚えた設定を使う。AI の Docker の守りが、ボリュームの持ち主を決めるのに使う） */
  async composeNames(project: Project): Promise<{ path: string; name: string }[]> {
    const out: { path: string; name: string }[] = [];
    for (const wp of await this.workplaces(project)) {
      for (const file of findComposeFiles(wp.path)) {
        const name = (await this.configs.read(upFilesFor(file), false)).config?.name;
        if (name) out.push({ path: wp.path, name });
      }
    }
    return out;
  }

  /** ログの画面のコンテナ（compose の見出しのキーで。なくなっていれば空） */
  async logSources(project: Project, composeKey: string): Promise<DockerLogSource[]> {
    const compose = (await this.list(project)).composes.find((c) => c.key === composeKey);
    return compose ? logSourcesOf(compose) : [];
  }

  /** ログの「さらに前を読む」: until より前の 500 行（この compose のコンテナだけ） */
  async logsBefore(project: Project, composeKey: string, container: string, until: string): Promise<DockerLogLine[]> {
    if (!(await this.logSources(project, composeKey)).some((s) => s.container === container)) throw new NotFound("この compose のコンテナではありません");
    const lines = await readLog(this.cli, ["--until", until, "--tail", String(DOCKER_LOG_TAIL), container]);
    return lines.filter((l) => !l.ts || l.ts < until);
  }

  /**
   * 「DB で開く」の材料: その compose の DB のサービスと、compose に聞いた設定。
   * ワークツリーの compose なら、本体の同じ compose・同じサービスのポートを添える（別のポートなら別の DB として名前を分けるため）
   */
  async dbSource(project: Project, composeKey: string, service: string): Promise<DockerDbSource> {
    const snap = await this.snapshot(project);
    requireEngine(snap);
    const compose = snap.list.composes.find((c) => c.key === composeKey);
    if (!compose) throw new NotFound("この compose はもうありません。一覧を取り直してください");
    const svc = compose.services.find((s) => s.name === service);
    if (!svc?.db_kind) throw new Invalid("DB のサービスではありません");
    const files = snap.upFiles.get(compose.key) ?? [];
    const read = files.length ? await this.configs.read(files, false) : null;
    if (!read?.doc) throw new Invalid(read?.error ?? "compose の設定を読めませんでした");
    const main = compose.worktree_path === null ? null : snap.list.composes.find((c) => c.worktree_path === null && c.file === compose.file);
    const mainPort = main?.services.find((s) => s.name === service)?.published[0] ?? null;
    return { compose, service, doc: read.doc, mainPort };
  }

  private async load(project: Project): Promise<Snapshot> {
    const empty = { composes: [], others: [], silent: {} };
    if (!this.cli.bin()) return { list: { engine: "missing", context: null, starter: null, ...empty }, containers: [], owner: new Map(), upFiles: new Map() };
    const [up, context] = await Promise.all([this.cli.engineUp(), this.cli.context()]);
    if (!up) return { list: { engine: "stopped", context, starter: this.engine.starterOf(context), ...empty }, containers: [], owner: new Map(), upFiles: new Map() };

    const [workplaces, containers] = await Promise.all([this.workplaces(project), this.containers({ timeoutMs: 10_000 })]);
    const entries = await this.entries(workplaces, containers);
    const built = buildDockerList(workplaces, containers, entries);
    const upFiles = new Map<string, string[]>();
    for (const c of built.composes) {
      const head = c.file ? path.join(workplaces.find((w) => (w.worktree_path ?? null) === c.worktree_path)?.path ?? "", c.file) : null;
      const entry = entries.find((e) => e.file === head);
      upFiles.set(c.key, entry?.upFiles ?? []);
    }
    // 静かなぶつかり: このプロジェクトの動いているコンテナが Mac に出しているポートを、Docker の外のプロセスも待っていないか（AI・ターミナルが起動したものも）
    const portsById = new Map(containers.filter((c) => c.state === "running" && built.owner.has(c.id)).map((c) => [c.id, hostPortsOf(c)] as const));
    const silent = await this.ports.silent(portsById);
    return { list: { engine: "ok", context, starter: this.engine.starterOf(context), composes: built.composes.map((c) => ({ ...c, operation: null, failure: null })), others: built.others, silent }, containers, owner: built.owner, upFiles };
  }

  /** compose のファイルごとの読み取り（見つけたものと、作ったコンテナのラベルにあるもの）。作ってあるものはラベルのファイルで up する */
  private async entries(workplaces: Workplace[], containers: RawContainer[]): Promise<ComposeEntry[]> {
    const wanted = new Map<string, { workplace: string; file: string; upFiles: string[]; discovered: boolean; created: boolean }>();
    for (const wp of workplaces) for (const file of findComposeFiles(wp.path)) wanted.set(file, { workplace: wp.path, file, upFiles: upFilesFor(file), discovered: true, created: false });
    for (const c of containers) {
      const head = headFileOf(c);
      if (!head || !c.dir) continue;
      const wp = deepestWorkplace(c.dir, workplaces);
      if (!wp) continue;
      const known = wanted.get(head);
      wanted.set(head, { workplace: wp.path, file: head, upFiles: c.files, discovered: known?.discovered ?? false, created: true });
    }
    return Promise.all(
      [...wanted.values()].map(async (w) => {
        const filesExist = w.upFiles.length > 0 && w.upFiles.every(pathExists);
        const read = filesExist ? await this.configs.read(w.upFiles, w.created) : { config: null, error: null, hashes: null, doc: null };
        return { workplace: w.workplace, file: w.file, upFiles: w.upFiles, filesExist, discovered: w.discovered, ...read };
      }),
    );
  }
}
