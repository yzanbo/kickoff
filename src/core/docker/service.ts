// Docker タブのコア: 一覧（エンジンの様子・compose の見出し・ほかのプロジェクトの数）・操作（compose ごとに 1 つずつ・［中止］・失敗を残す）・
// docker events（見ている画面があるときだけ）。DB は使わない（覚えるものはメモリだけ）
import fs from "node:fs";
import path from "node:path";
import type { DockerAction, DockerActionBody, DockerFailure, DockerList, DockerLogLine, DockerLogSource, DockerOperation, Project } from "@shared/types";
import { DOCKER_SHARED_PROJECT } from "@shared/types";
import { errorMessage } from "@shared/errors";
import type { Bus } from "../bus.js";
import { listWorktrees } from "../git/worktrees.js";
import { Conflict, Invalid, NotFound } from "../http/errors.js";
import { CommandError } from "../system/exec.js";
import { realPathOrSelf } from "../system/paths.js";
import type { StreamedCommand } from "../system/stream.js";
import { planDockerAction, type DockerStep } from "./actions.js";
import { DockerCli, shellWord } from "./cli.js";
import { ComposeConfigCache, findComposeFiles, upFilesFor } from "./compose.js";
import { DockerEvents } from "./events.js";
import { buildDockerList, headFileOf, logSourcesOf, sharedVictims, type ComposeEntry, type Workplace } from "./listing.js";
import { DOCKER_LOG_TAIL, readLog } from "./logs.js";
import { PS_FORMAT, parsePs, starterOf, type RawContainer } from "./parse.js";
import { allocatedPortOf, conflictLabel, hostPortsOf, portConflictsOf } from "./portConflict.js";
import { DockerPorts } from "./ports.js";

/** 失敗の文に残す標準エラーの行数 */
const FAILURE_LINES = 8;

/** 動いている操作（止める口と、失敗を残すときの操作。［相手を止めて起動］なら、やり直した元の操作） */
interface RunningOp {
  op: DockerOperation;
  projectId: number;
  stream: StreamedCommand | null;
  cancelled: boolean;
  failureAction: DockerAction;
}

/** 一覧を作ったときの中身（操作で compose を引き当てる） */
interface Snapshot {
  list: DockerList;
  containers: RawContainer[];
  owner: Map<string, string>;
  upFiles: Map<string, string[]>;
}

export class DockerService {
  readonly cli: DockerCli;
  private readonly configs: ComposeConfigCache;
  private readonly events: DockerEvents;
  /** compose（見出しのキー）ごとの動いている操作と、止める口 */
  private readonly operations = new Map<string, RunningOp>();
  private readonly failures = new Map<string, DockerFailure>();
  /** 静かなぶつかりを調べる口（テストでは probe を差し替える） */
  readonly ports = new DockerPorts();

  constructor(
    private readonly bus: Bus,
    cli = new DockerCli(),
  ) {
    this.cli = cli;
    this.configs = new ComposeConfigCache(cli);
    this.events = new DockerEvents(cli, (projectIds) => projectIds.forEach((id) => this.changed(id)));
  }

  private changed(projectId: number) {
    this.bus.publish({ type: "docker_changed", project_id: projectId });
  }

  /** 見ています（画面が 20 秒ごとに送る）。docker events を立て、今の一覧を返す */
  async watch(project: Project): Promise<DockerList> {
    const list = await this.list(project);
    this.events.lease(project.id);
    return list;
  }

  /** ［↻］: 覚えた compose の設定を捨てて取り直す */
  async refresh(project: Project): Promise<DockerList> {
    this.configs.clear();
    return this.list(project);
  }

  /** 一覧 */
  async list(project: Project): Promise<DockerList> {
    return (await this.snapshot(project)).list;
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

  private async workplaces(project: Project): Promise<Workplace[]> {
    const root = realPathOrSelf(project.repo_path);
    try {
      const wts = await listWorktrees(project.repo_path);
      return wts.filter((w) => !w.prunable).map((w) => ({ path: realPathOrSelf(w.path), worktree_path: w.main ? null : w.path, branch: w.branch }));
    } catch {
      return [{ path: root, worktree_path: null, branch: null }];
    }
  }

  private async snapshot(project: Project): Promise<Snapshot> {
    const empty = { composes: [], others: [], silent: {} };
    if (!this.cli.bin()) return { list: { engine: "missing", context: null, starter: null, ...empty }, containers: [], owner: new Map(), upFiles: new Map() };
    const [up, context] = await Promise.all([this.cli.engineUp(), this.cli.context()]);
    if (!up) return { list: { engine: "stopped", context, starter: starterOf(context), ...empty }, containers: [], owner: new Map(), upFiles: new Map() };

    const [workplaces, psOut] = await Promise.all([this.workplaces(project), this.cli.run(["ps", "-a", "--format", PS_FORMAT], { timeout: 10_000 })]);
    const containers = parsePs(psOut).map((c) => ({ ...c, dir: c.dir ? realPathOrSelf(c.dir) : null, files: c.files.map((f) => realPathOrSelf(f)) }));
    const entries = await this.entries(workplaces, containers);
    const built = buildDockerList(workplaces, containers, entries);
    const upFiles = new Map<string, string[]>();
    for (const c of built.composes) {
      const head = c.file ? path.join(workplaces.find((w) => (w.worktree_path ?? null) === c.worktree_path)?.path ?? "", c.file) : null;
      const entry = entries.find((e) => e.file === head);
      upFiles.set(c.key, entry?.upFiles ?? []);
    }
    const composes = built.composes.map((c) => ({ ...c, operation: this.operations.get(c.key)?.op ?? null, failure: this.failures.get(c.key) ?? null }));
    // 静かなぶつかり: このプロジェクトの動いているコンテナが Mac に出しているポートを、Docker の外のプロセスも待っていないか（AI・ターミナルが起動したものも）
    const portsById = new Map(containers.filter((c) => c.state === "running" && built.owner.has(c.id)).map((c) => [c.id, hostPortsOf(c)] as const));
    const silent = await this.ports.silent(portsById);
    return { list: { engine: "ok", context, starter: starterOf(context), composes, others: built.others, silent }, containers, owner: built.owner, upFiles };
  }

  /** compose のファイルごとの読み取り（見つけたものと、作ったコンテナのラベルにあるもの）。作ってあるものはラベルのファイルで up する */
  private async entries(workplaces: Workplace[], containers: RawContainer[]): Promise<ComposeEntry[]> {
    const wanted = new Map<string, { workplace: string; file: string; upFiles: string[]; discovered: boolean; created: boolean }>();
    for (const wp of workplaces) for (const file of findComposeFiles(wp.path)) wanted.set(file, { workplace: wp.path, file, upFiles: upFilesFor(file), discovered: true, created: false });
    for (const c of containers) {
      const head = headFileOf(c);
      if (!head || !c.dir) continue;
      const wp = workplaces.filter((w) => c.dir === w.path || c.dir?.startsWith(`${w.path}/`)).sort((a, b) => b.path.length - a.path.length)[0];
      if (!wp) continue;
      const known = wanted.get(head);
      wanted.set(head, { workplace: wp.path, file: head, upFiles: c.files, discovered: known?.discovered ?? false, created: true });
    }
    return Promise.all(
      [...wanted.values()].map(async (w) => {
        const filesExist = w.upFiles.length > 0 && w.upFiles.every(pathExists);
        const read = filesExist ? await this.configs.read(w.upFiles, w.created) : { config: null, error: null, hashes: null };
        return { workplace: w.workplace, file: w.file, upFiles: w.upFiles, filesExist, discovered: w.discovered, ...read };
      }),
    );
  }

  /** 操作（待たずに始め、様子は docker_changed で知らせる）。別の作業場所と同じ組になる起動は、確かめるまで 409 */
  async act(project: Project, body: DockerActionBody): Promise<void> {
    if (body.action === "cancel") {
      const running = this.operations.get(body.compose);
      if (!running) throw new Conflict("動いている操作はありません");
      running.cancelled = true;
      running.stream?.stop();
      return;
    }
    if (body.action === "dismiss") {
      this.failures.delete(body.compose);
      this.changed(project.id);
      return;
    }
    if (this.operations.has(body.compose)) throw new Conflict("この compose ではほかの操作が動いています。終わってからもう一度押してください");
    const snap = await this.snapshot(project);
    if (snap.list.engine !== "ok") throw new Invalid(snap.list.engine === "missing" ? "Docker が入っていません" : "Docker が動いていません");
    const compose = snap.list.composes.find((c) => c.key === body.compose);
    if (!compose) throw new NotFound("この compose はもうありません。一覧を取り直してください");
    const upFiles = snap.upFiles.get(compose.key) ?? [];
    // ［相手を止めて起動］は最後の失敗（やり直す操作とポートでぶつかった相手）から組み立て、失敗したらやり直した元の操作として残す
    const prev = body.action === "stop_others_and_start" ? this.failures.get(compose.key) : undefined;
    const plan = planDockerAction({ compose, upFiles, action: body.action, service: body.service, container: body.container, retry: prev });
    const failureAction: DockerAction = prev?.action ?? body.action;
    const service = prev ? prev.service : (body.service ?? null);
    if (plan.usesUp && !body.confirm_shared) {
      const victims = sharedVictims(compose.key, compose.project_name, snap.containers, snap.owner);
      if (victims.length) throw new Conflict(sharedMessage(compose.project_name ?? "", victims), DOCKER_SHARED_PROJECT);
    }
    this.failures.delete(compose.key);
    const op: DockerOperation = { action: body.action, service, started_at: new Date().toISOString(), cancellable: plan.steps.some((s) => s.stream) };
    const running: RunningOp = { op, projectId: project.id, stream: null, cancelled: false, failureAction };
    this.operations.set(compose.key, running);
    this.changed(project.id);
    void this.runSteps(project, compose.key, running, plan.steps);
  }

  private async runSteps(project: Project, key: string, running: RunningOp, steps: DockerStep[]) {
    let failure: DockerFailure | null = null;
    for (const step of steps) {
      if (running.cancelled) break;
      const message = await this.runStep(step, running);
      if (message !== null && !running.cancelled) {
        const conflicts = allocatedPortOf(message) === null ? [] : await this.conflictsFor(project, key, running.op.service).catch(() => []);
        failure = { action: running.failureAction, service: running.op.service, message, command: `docker ${step.args.map(shellWord).join(" ")}`, cwd: step.cwd, conflicts, at: new Date().toISOString() };
        break;
      }
    }
    this.operations.delete(key);
    if (failure) this.failures.set(key, failure);
    this.changed(running.projectId);
  }

  /**
   * ポートで失敗したときの相手（エラー文には最初の 1 つしか出ないので、起動しようとしたサービスの Mac に出すポートを、動いているコンテナとすべて突き合わせる）。
   * サービスの行ならそのサービス、すべて起動なら札のないサービス
   */
  private async conflictsFor(project: Project, key: string, service: string | null) {
    const snap = await this.snapshot(project);
    const compose = snap.list.composes.find((c) => c.key === key);
    if (!compose) return [];
    const published = compose.services.filter((s) => (service ? s.name === service : s.profiles.length === 0)).flatMap((s) => s.published);
    const composeOf = (id: string) => snap.list.composes.find((c) => c.key === snap.owner.get(id));
    return portConflictsOf(published, snap.containers, (c) => snap.owner.get(c.id) === key, (c) => conflictLabel(c, composeOf));
  }

  /** 静かなぶつかりの［Docker の db を使う］: 相手の Homebrew のサービスを止める（いまぶつかっている相手の名前だけ受ける）。戻し方の文を返す */
  async stopBrewService(project: Project, name: string): Promise<string> {
    const snap = await this.snapshot(project);
    const known = Object.values(snap.list.silent).some((list) => list.some((c) => c.brew_service === name));
    if (!known) throw new Invalid("いまポートでぶつかっている Homebrew のサービスではありません。一覧を取り直してください");
    await this.ports.stopBrew(name);
    this.changed(project.id);
    return `${name} を止めました。戻すときは brew services start ${name} を流してください`;
  }

  /** 1 つ流す。失敗なら標準エラーの最後の数行（成功なら null） */
  private async runStep(step: DockerStep, running: { stream: StreamedCommand | null }): Promise<string | null> {
    if (!step.stream) {
      try {
        await this.cli.run(step.args, { cwd: step.cwd, timeout: 120_000 });
        return null;
      } catch (e) {
        return tail(e instanceof CommandError ? e.stderr || e.message : errorMessage(e));
      }
    }
    // up -d は初めての pull・build で数分かかるので時間で打ち切らない（［中止］で止める）
    const stream = this.cli.stream(step.args, { cwd: step.cwd, tailLines: FAILURE_LINES });
    if (!stream) return "Docker が入っていません";
    running.stream = stream;
    const result = await stream.done;
    running.stream = null;
    return result.code === 0 ? null : tail(result.stderrTail || "失敗しました");
  }

  /** コアを閉じるとき（流しているものは stopAllStreams が止める） */
  close() {
    this.events.stop();
  }
}

const tail = (s: string) => s.split("\n").filter(Boolean).slice(-FAILURE_LINES).join("\n").trim() || "失敗しました";

const pathExists = (p: string) => fs.existsSync(p);

/** 同じ組になる起動の確かめの文 */
function sharedMessage(name: string, victims: RawContainer[]): string {
  const where = [...new Set(victims.map((v) => (v.dir ? path.basename(v.dir) : v.name)))].join("・");
  return `${where} の組と同じ名前（${name}）です。起動すると、そちらのコンテナが作り直されます`;
}
