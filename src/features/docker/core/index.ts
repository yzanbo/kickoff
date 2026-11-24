// Docker の機能のコアの入口（ほかの機能はここだけを読む）
import type { Project } from "@shared/projects/types";
import type { CoreFeature } from "@/foundation/core/feature";
import type { Kernel } from "@/foundation/core/kernel";
import type { GuardApi } from "@/features/guard/core/index";
import type { ProjectsApi } from "@/features/projects/core/index";
import { DockerCli } from "./cli";
import { ComposeConfigCache, composeReader, type ComposeReader } from "./compose";
import type { DockerEngineStarters } from "./engine";
import { dockerFacts, dockerRuleSource } from "./facts";
import type { DockerGuardFacts } from "./guard/dockerGuard";
import { DockerLister, type DockerDbSource } from "./list";
import { DockerOperations } from "./operations";
import { DockerPorts, type PortProbe } from "./ports";
import { dockerRoutes } from "./routes/docker";
import { DockerWatch } from "./watch";

export type { ComposeReader } from "./compose";
export type { DockerDbSource } from "./list";

/** ほかの機能が読む Docker の口 */
export interface DockerApi {
  /** 「DB で開く」の材料（compose に聞いた設定とポート）。案にするのは database */
  dbCandidate(project: Project, composeKey: string, service: string): Promise<DockerDbSource>;
  /** compose の口（ワークツリーの実行環境と後始末） */
  compose: ComposeReader;
  /** 待っているソケット（ワークツリーの実行環境が空いている帯を選ぶ） */
  portProbe: Pick<PortProbe, "listeningSockets">;
  /** AI の Docker の守りが見る様子（作業場所 cwd のチャット） */
  facts(project: Project, cwd: string): DockerGuardFacts;
}

/** Docker の中の 3 つ（読み・操作・見ている間の流れ。受け口とテストが使う） */
export interface DockerParts {
  lister: DockerLister;
  operations: DockerOperations;
  watch: DockerWatch;
}

export interface DockerEnv {
  /** macOS の Docker のエンジンの起こし方 */
  engine: DockerEngineStarters;
  /** docker のコマンド（テストは偽の docker。省けば本物） */
  cli?: DockerCli;
  /** 静かなぶつかりを調べる口（テストは偽の lsof・brew。省けば本物） */
  portProbe?: PortProbe;
}

/** Docker タブ（docker events は見ている画面があるときだけ動かす。チャットの AI の Docker の守りも、これで相手を引く） */
export function createDocker(k: Kernel, deps: { projects: Pick<ProjectsApi, "param">; guard: Pick<GuardApi, "addRuleSource"> }, env: DockerEnv): CoreFeature<DockerApi & { parts: DockerParts }> {
  const cli = env.cli ?? new DockerCli();
  const ports = new DockerPorts(k.platform.listeningSockets);
  if (env.portProbe) ports.probe = env.portProbe;
  const configs = new ComposeConfigCache(cli);
  const lister = new DockerLister(cli, configs, ports, env.engine);
  // 変わったら覚えた一覧のもとを捨ててから知らせる（画面が取り直す）
  const changed = (projectId: number) => {
    lister.invalidate(projectId);
    k.bus.publish({ type: "docker_changed", project_id: projectId });
  };
  const operations = new DockerOperations(lister, ports, changed);
  const watch = new DockerWatch(lister, (projectIds) => projectIds.forEach(changed), k.clock);
  const facts = (project: Project, cwd: string) => dockerFacts(lister, project, cwd);
  // ほかの作業場所・プロジェクトの Docker の守りを登録する
  deps.guard.addRuleSource(dockerRuleSource(facts));
  const api = {
    dbCandidate: (project: Project, composeKey: string, service: string) => lister.dbSource(project, composeKey, service),
    compose: composeReader(configs, cli),
    portProbe: { listeningSockets: () => ports.probe.listeningSockets() },
    facts,
    parts: { lister, operations, watch },
  };
  return { name: "docker", api, routes: [dockerRoutes({ projectParam: deps.projects.param, parts: api.parts, bus: k.bus, clock: k.clock })], stop: () => watch.close() };
}
