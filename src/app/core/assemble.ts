// 機能の組み立て: 機能を下の層から作って並べる（本物の起動 startCore.ts とテストの createTestCore が同じものを通る）。いまは全部が仮の機能 legacy の中
import type { AssembledCore } from "@/foundation/core/feature";
import type { KernelWithStore } from "@/foundation/core/kernel";
import type { TerminalSessions } from "@/features/terminal/core/sessions";
import { createLegacy, type LegacyApi } from "./legacy";
import type { CorePrepared } from "./prepare";
import type { CoreEnv } from "./types";

/** 並べた機能と、起動したコアの口（Core）・テストに出すもの */
export interface AppAssembly extends AssembledCore {
  /** 機能の口（テストが中のサービスを見る） */
  apis: { legacy: LegacyApi };
  runningChats(): { id: number; title: string | null }[];
  awakeNeeds(): { running: number; mobileEnabled: boolean };
  terminals: TerminalSessions;
}

/** 機能を作って並べる（待つものは prepareCore で先に済ませる。テストの偽物は何も待たない） */
export function assembleCore(k: KernelWithStore, env: CoreEnv, prepared: CorePrepared = { relay: null }): AppAssembly {
  const legacy = createLegacy(k, env, prepared);
  const { runner, terminals, hooks } = legacy.api;
  return {
    features: [legacy],
    hooks,
    apis: { legacy: legacy.api },
    runningChats: () => runner.busyChats(),
    awakeNeeds: () => ({ running: runner.stats().running, mobileEnabled: k.settings.get().remote_enabled }),
    terminals,
  };
}
