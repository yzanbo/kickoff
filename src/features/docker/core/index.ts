// Docker の機能のコアの入口（ほかの機能はここだけを読む）
import type { CoreFeature } from "@/foundation/core/feature";
import type { KernelWithStore } from "@/foundation/core/kernel";
import type { DockerCli } from "./cli";
import type { DockerEngineStarters } from "./engine";
import type { PortProbe } from "./ports";
import { DockerService } from "./service";
import { dockerRoutes } from "./routes/docker";

export type { DockerService } from "./service";

export interface DockerEnv {
  /** macOS の Docker のエンジンの起こし方 */
  engine: DockerEngineStarters;
  /** docker のコマンド（テストは偽の docker。省けば本物） */
  cli?: DockerCli;
  /** 静かなぶつかりを調べる口（テストは偽の lsof・brew。省けば本物） */
  portProbe?: PortProbe;
}

/** Docker タブ（docker events は見ている画面があるときだけ動かす。チャットの AI の Docker の守りも、これで相手を引く） */
export function createDocker(k: KernelWithStore, env: DockerEnv): CoreFeature<DockerService> {
  const docker = new DockerService(k.bus, { listeningSockets: k.platform.listeningSockets, dockerEngine: env.engine }, env.cli);
  if (env.portProbe) docker.ports.probe = env.portProbe;
  return { name: "docker", api: docker, routes: [{ legacy: (app) => dockerRoutes(app, { store: k.store, docker, bus: k.bus }) }], stop: () => docker.close() };
}
