// コアが落ちたあと、残った子（エージェントの CLI・DB ワーカーの ssh・シェル）を止める
// （古い子が会話記録・作業場所を書いている間に、作り直したコアで再開が走ると食い違う）
import { errorMessage } from "@shared/foundation/errors";
import type { HostPlatform } from "@/foundation/core/platform/types";
import { childrenToStop, type CoreChildren } from "./coreChildren";
import { stopProcesses } from "./processes";

/** 子を SIGTERM で止めてから SIGKILL を送るまで */
const CHILD_KILL_WAIT_MS = 2_000;

/** 覚えた子のうち、親が落ちたコア・DB ワーカー（parents）か launchd のものを止める（止める前にプロセスの表で親を確かめる）。覚えは空にする */
export async function stopLeftovers(children: CoreChildren, parents: readonly number[], host: Pick<HostPlatform, "processTable" | "alive">, log: (message: string) => void): Promise<void> {
  let targets: { pid: number; group: boolean }[] = [];
  try {
    targets = childrenToStop(children, await host.processTable(), parents);
  } catch (e) {
    log(`残った子を調べられません: ${errorMessage(e)}`);
  }
  children.clear();
  if (targets.length === 0) return;
  log(`残ったコアの子を止めます ${targets.map((t) => t.pid).join(",")}`);
  await stopProcesses(targets, { waitMs: CHILD_KILL_WAIT_MS, killAfter: true }, host);
}
