// 機能の組み立て: 機能を下の層から作って並べる（本物の起動 startCore.ts とテストの createTestCore が同じものを通る）。まだ分けていないものは仮の機能 legacy の中
import type { AssembledCore } from "@/foundation/core/feature";
import type { KernelWithStore } from "@/foundation/core/kernel";
import type { TerminalSessions } from "@/features/terminal/core/sessions";
import { createSettings } from "@/features/settings/core/index";
import { createTrash, type TrashApi } from "@/features/trash/core/index";
import { createProjects } from "@/features/projects/core/index";
import { createGroups } from "@/features/groups/core/index";
import { createSnippets } from "@/features/snippets/core/index";
import { createLegacy, type LegacyApi } from "./legacy";
import type { CorePrepared } from "./prepare";
import type { CoreEnv } from "./types";

/** 並べた機能と、起動したコアの口（Core）・テストに出すもの */
export interface AppAssembly extends AssembledCore {
  /** 機能の口（テストが中のサービスを見る） */
  apis: { trash: TrashApi; legacy: LegacyApi };
  runningChats(): { id: number; title: string | null }[];
  awakeNeeds(): { running: number; mobileEnabled: boolean };
  terminals: TerminalSessions;
}

/** 機能を作って並べる（待つものは prepareCore で先に済ませる。テストの偽物は何も待たない） */
export function assembleCore(k: KernelWithStore, env: CoreEnv, prepared: CorePrepared = { relay: null }): AppAssembly {
  const settings = createSettings(k);
  const trash = createTrash(k, env.trash);
  const projects = createProjects(k, { trash: trash.api });
  const groups = createGroups(k);
  const snippets = createSnippets(k);
  const legacy = createLegacy(k, env, prepared, { trash: trash.api });
  const { runner, terminals, hooks } = legacy.api;
  return {
    features: [settings, trash, projects, groups, snippets, legacy],
    hooks,
    apis: { trash: trash.api, legacy: legacy.api },
    runningChats: () => runner.busyChats(),
    awakeNeeds: () => ({ running: runner.stats().running, mobileEnabled: k.settings.get().remote_enabled }),
    terminals,
  };
}
