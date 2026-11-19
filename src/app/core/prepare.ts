// 機能を組み立てる前に待つ準備（外の世界に置く・起こすもの）。テストの偽物では何もしない
import path from "node:path";
import { errorMessage } from "@shared/foundation/errors";
import type { Kernel } from "@/foundation/core/kernel";
import { startNetworkRelay, type NetworkRelay } from "@/features/guard/core/sandbox/networkRelay";
import { installTrashCommand } from "@/features/trash/core/command";
import type { CoreEnv } from "./types";

export interface CorePrepared {
  /** 置いた kickoff-trash（置かない・置けなければ undefined） */
  trashCommandFile?: string;
  /** Bash の通信の中継（起こさない・起こせなければ null） */
  relay: NetworkRelay | null;
}

/** AI の rm の代わりの kickoff-trash を bin/ に置き、Bash の通信の中継を起こす（どちらも失敗したら記録して、なしで続ける） */
export async function prepareCore(k: Pick<Kernel, "paths" | "log">, env: CoreEnv): Promise<CorePrepared> {
  const trashCommandFile = env.trash.installCommand
    ? await installTrashCommand(path.join(k.paths.dataDir, "bin")).catch((e: unknown) => (k.log.warn(`kickoff-trash を置けませんでした: ${errorMessage(e)}`), undefined))
    : undefined;
  const relay = env.guard.relay ? await startNetworkRelay().catch((e: unknown) => (k.log.warn(`Bash の通信の中継を起こせませんでした: ${errorMessage(e)}`), null)) : null;
  return { trashCommandFile, relay };
}
