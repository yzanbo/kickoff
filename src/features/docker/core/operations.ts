// Docker タブの操作: compose ごとに 1 つずつ・［中止］・失敗を残す（最後の数行と流し直すコマンド・ポートの相手）・Homebrew のサービスを止める
import { type DockerAction, type DockerActionBody, type DockerFailure, type DockerOperation, DOCKER_SHARED_PROJECT } from "@shared/docker/types";
import type { Project } from "@shared/projects/types";
import { Conflict, Invalid, NotFound } from "@/foundation/core/errors";
import { commandMessage } from "@/foundation/core/system/exec";
import type { StreamedCommand } from "@/foundation/core/system/stream";
import { planDockerAction, startedServices, type DockerStep } from "./actions";
import { shellWord } from "./cli";
import { sharedMessage, sharedVictims } from "./listing";
import { requireEngine, type DockerLister } from "./list";
import { allocatedPortOf, conflictLabel, portConflictsOf } from "./portConflict";
import type { DockerPorts } from "./ports";

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

const tail = (s: string) => s.split("\n").filter(Boolean).slice(-FAILURE_LINES).join("\n").trim() || "失敗しました";

export class DockerOperations {
  /** compose（見出しのキー）ごとの動いている操作と、止める口 */
  private readonly running = new Map<string, RunningOp>();
  /**
   * 調べてから始めるまでの間の予約（compose のキー）。一覧を取り直す間に 2 つ目の操作が届いても、すり抜けて両方流れないように、
   * 調べたらすぐ覚え、始めた（running に入れた）・断ったら外す
   */
  private readonly reserved = new Set<string>();
  private readonly failures = new Map<string, DockerFailure>();

  constructor(
    private readonly lister: DockerLister,
    private readonly ports: DockerPorts,
    /** 変わったことを知らせる（覚えた一覧のもとを捨ててから docker_changed） */
    private readonly changed: (projectId: number) => void,
  ) {
    lister.stateOf = (key) => ({ operation: this.running.get(key)?.op ?? null, failure: this.failures.get(key) ?? null });
  }

  /** 操作（待たずに始め、様子は docker_changed で知らせる）。別の作業場所と同じ組になる起動は、確かめるまで 409 */
  async act(project: Project, body: DockerActionBody): Promise<void> {
    if (body.action === "cancel") {
      const running = this.running.get(body.compose);
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
    if (this.running.has(body.compose) || this.reserved.has(body.compose)) throw new Conflict("この compose ではほかの操作が動いています。終わってからもう一度押してください");
    this.reserved.add(body.compose);
    try {
      const snap = await this.lister.snapshot(project);
      requireEngine(snap);
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
        const composeOf = (id: string) => snap.list.composes.find((x) => x.key === snap.owner.get(id));
        if (victims.length) throw new Conflict(sharedMessage(compose.project_name ?? "", victims, compose, composeOf), DOCKER_SHARED_PROJECT);
      }
      this.failures.delete(compose.key);
      const op: DockerOperation = { action: body.action, service, started_at: new Date().toISOString(), cancellable: plan.steps.some((s) => s.stream) };
      const running: RunningOp = { op, projectId: project.id, stream: null, cancelled: false, failureAction };
      this.running.set(compose.key, running);
      this.changed(project.id);
      void this.runSteps(project, compose.key, running, plan.steps);
    } finally {
      this.reserved.delete(body.compose);
    }
  }

  private async runSteps(project: Project, key: string, running: RunningOp, steps: DockerStep[]) {
    let failure: DockerFailure | null = null;
    for (const step of steps) {
      if (running.cancelled) break;
      const message = await this.runStep(step, running);
      if (message !== null && !running.cancelled) {
        // 相手を探す一覧は、流したあとのもの（覚えた一覧のもとを捨ててから読む）
        this.lister.invalidate(project.id);
        const conflicts = allocatedPortOf(message) === null ? [] : await this.conflictsFor(project, key, running.op.service).catch(() => []);
        failure = { action: running.failureAction, service: running.op.service, message, command: `docker ${step.args.map(shellWord).join(" ")}`, cwd: step.cwd, conflicts, at: new Date().toISOString() };
        break;
      }
    }
    this.running.delete(key);
    if (failure) this.failures.set(key, failure);
    this.changed(running.projectId);
  }

  /**
   * ポートで失敗したときの相手（エラー文には最初の 1 つしか出ないので、起動しようとしたサービスの Mac に出すポートを、動いているコンテナとすべて突き合わせる）。
   * サービスの行ならそのサービス、すべて起動なら札のないサービス
   */
  private async conflictsFor(project: Project, key: string, service: string | null) {
    const snap = await this.lister.snapshot(project);
    const compose = snap.list.composes.find((c) => c.key === key);
    if (!compose) return [];
    const published = startedServices(compose, service).flatMap((s) => s.published);
    const composeOf = (id: string) => snap.list.composes.find((c) => c.key === snap.owner.get(id));
    return portConflictsOf(published, snap.containers, (c) => snap.owner.get(c.id) === key, (c) => conflictLabel(c, composeOf));
  }

  /** 静かなぶつかりの［Docker の db を使う］: 相手の Homebrew のサービスを止める（いまぶつかっている相手の名前だけ受ける）。戻し方の文を返す */
  async stopBrewService(project: Project, name: string): Promise<string> {
    const snap = await this.lister.snapshot(project);
    const known = Object.values(snap.list.silent).some((list) => list.some((c) => c.brew_service === name));
    if (!known) throw new Invalid("いまポートでぶつかっている Homebrew のサービスではありません。一覧を取り直してください");
    await this.ports.stopBrew(name);
    this.changed(project.id);
    return `${name} を止めました。戻すときは brew services start ${name} を流してください`;
  }

  /** 1 つ流す。失敗なら標準エラーの最後の数行（成功なら null） */
  private async runStep(step: DockerStep, running: { stream: StreamedCommand | null }): Promise<string | null> {
    const cli = this.lister.cli;
    if (!step.stream) {
      try {
        await cli.run(step.args, { cwd: step.cwd, timeout: 120_000 });
        return null;
      } catch (e) {
        return tail(commandMessage(e));
      }
    }
    // up -d は初めての pull・build で数分かかるので時間で打ち切らない（［中止］で止める）
    const stream = cli.stream(step.args, { cwd: step.cwd, tailLines: FAILURE_LINES });
    if (!stream) return "Docker が入っていません";
    running.stream = stream;
    const result = await stream.done;
    running.stream = null;
    return result.code === 0 ? null : tail(result.stderrTail || "失敗しました");
  }
}
