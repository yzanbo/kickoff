// 機能の組み立て: 機能を下の層から作って並べる（本物の起動 startCore.ts が通る）。いまは全部が仮の機能 legacy の中
import type { AssembledCore } from "@/foundation/core/feature";
import type { KernelWithStore } from "@/foundation/core/kernel";
import type { TerminalSessions } from "@/features/terminal/core/sessions";
import { createLegacy } from "./legacy";
import type { CoreOptions } from "./types";

/** 並べた機能と、起動したコアの口（Core）に出すもの */
export interface AppAssembly extends AssembledCore {
  runningChats(): { id: number; title: string | null }[];
  awakeNeeds(): { running: number; mobileEnabled: boolean };
  terminals: TerminalSessions;
}

export async function assembleCore(k: KernelWithStore, opts: CoreOptions): Promise<AppAssembly> {
  const legacy = await createLegacy(k, opts);
  const { runner, terminals, hooks } = legacy.api;
  return {
    features: [legacy],
    hooks,
    runningChats: () => runner.busyChats(),
    awakeNeeds: () => ({ running: runner.stats().running, mobileEnabled: k.settings.get().remote_enabled }),
    terminals,
  };
}
