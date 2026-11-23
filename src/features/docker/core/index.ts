// Docker の機能のコアの入口（ほかの機能はここだけを読む）
import type { CoreFeature } from "@/foundation/core/feature";
import type { Kernel } from "@/foundation/core/kernel";
import type { DockerCli } from "./cli";
import type { DockerEngineStarters } from "./engine";
import type { PortProbe } from "./ports";
import { DockerService } from "./service";
import type { ChatApi } from "@/features/chat/core/index";
import { dockerRoutes, type DockerRouteDeps } from "./routes/docker";
import type { GuardApi } from "@/features/guard/core/index";
import { dockerRuleSource } from "./guardFacts";

export type { DockerService } from "./service";
export type { ComposeReader } from "./compose";

export interface DockerEnv {
  /** macOS の Docker のエンジンの起こし方 */
  engine: DockerEngineStarters;
  /** docker のコマンド（テストは偽の docker。省けば本物） */
  cli?: DockerCli;
  /** 静かなぶつかりを調べる口（テストは偽の lsof・brew。省けば本物） */
  portProbe?: PortProbe;
}

/** Docker タブ（docker events は見ている画面があるときだけ動かす。チャットの AI の Docker の守りも、これで相手を引く） */
export function createDocker(k: Kernel, deps: Pick<DockerRouteDeps, "dbConnectionsOf"> & { chat: Pick<ChatApi, "store">; guard: Pick<GuardApi, "addRuleSource"> }, env: DockerEnv): CoreFeature<DockerService> {
  const docker = new DockerService(k.bus, { listeningSockets: k.platform.listeningSockets, dockerEngine: env.engine }, env.cli);
  // ほかの作業場所・プロジェクトの Docker の守りを登録する
  deps.guard.addRuleSource(dockerRuleSource(docker));
  if (env.portProbe) docker.ports.probe = env.portProbe;
  return { name: "docker", api: docker, routes: [{ legacy: (app) => dockerRoutes(app, { store: deps.chat.store, docker, bus: k.bus, dbConnectionsOf: deps.dbConnectionsOf }) }], stop: () => docker.close() };
}
