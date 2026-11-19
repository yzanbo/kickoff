// ゴミ箱の機能のコアの入口（ほかの機能はここだけを読む）
import path from "node:path";
import type { Project } from "@shared/types";
import type { CoreFeature } from "@/foundation/core/feature";
import type { KernelWithStore } from "@/foundation/core/kernel";
import { trashRoutes } from "./routes/trash";
import { TrashService } from "./service";

/** ゴミ箱の口（入れる・種類の登録・片付けの段・元の場所の引き当て・取り込みのあと） */
export type TrashApi = TrashService;

export interface TrashEnv {
  /** 入れた時刻・片付けの時計（省けば本物の時計） */
  now?: () => number;
  /** 元の場所を含むプロジェクトを、上の機能が登録した引き当てより先に引く（テストの前方一致） */
  projectOfPath?: (origin: string, projects: Project[]) => number | null;
}

/** Kickoff のゴミ箱（置き場は保存先の trash/。片付けは待ち受けのあとに始める） */
export function createTrash(k: KernelWithStore, env: TrashEnv): CoreFeature<TrashApi> {
  const trashBin = new TrashService({ store: k.store, dir: path.join(k.paths.dataDir, "trash"), now: env.now });
  const first = env.projectOfPath;
  if (first) trashBin.addOriginResolver((origin) => first(origin, k.store.projects.list()));
  return {
    name: "trash",
    api: trashBin,
    routes: [{ legacy: (app) => trashRoutes(app, { store: k.store, trashBin }) }],
    start: () => trashBin.start(),
    stop: () => trashBin.close(),
  };
}
