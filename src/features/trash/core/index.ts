// ゴミ箱の機能のコアの入口（ほかの機能はここだけを読む）
import path from "node:path";
import type { CoreFeature } from "@/foundation/core/feature";
import type { Kernel } from "@/foundation/core/kernel";
import { idParam } from "@/foundation/core/http/implement";
import { trashRoutes } from "./routes/trash";
import { TrashService } from "./service";
import { createTrashStore } from "./db/trash";

/** ゴミ箱の口（入れる・種類の登録・片付けの段・元の場所の引き当て・取り込みのあと） */
export type TrashApi = TrashService;
export type { StoredTrashItem, TrashStore } from "./db/trash";
export type { TrashKindDef } from "./kinds";
export { TRASH_COMMAND, trashCommandEnv, type TrashCommand } from "./command";

/** ゴミ箱が見るプロジェクトの項目（上の projects の Project の一部。:id の引き当てと、元の場所からプロジェクトを引くテストの前方一致） */
interface TrashProject {
  id: number;
  repo_path: string;
}

export interface TrashDeps {
  /** プロジェクトの店（上の projects。組み立てがあとで作るので、呼ばれたときに引く。:id のプロジェクトとテストの前方一致） */
  projects: () => { get(id: number): TrashProject | undefined; list(): TrashProject[] };
}

export interface TrashEnv {
  /** 入れた時刻・片付けの時計（省けば本物の時計） */
  now?: () => number;
  /** 元の場所を含むプロジェクトを、上の機能が登録した引き当てより先に引く（テストの前方一致） */
  projectOfPath?: (origin: string, projects: TrashProject[]) => number | null;
}

/** Kickoff のゴミ箱（置き場は保存先の trash/。片付けは待ち受けのあとに始める） */
export function createTrash(k: Kernel, deps: TrashDeps, env: TrashEnv): CoreFeature<TrashApi> {
  const items = createTrashStore(k.db, (e) => k.bus.publish(e));
  const trashBin = new TrashService({ items, dir: path.join(k.paths.dataDir, "trash"), now: env.now, clock: k.clock });
  const first = env.projectOfPath;
  if (first) trashBin.addOriginResolver((origin) => first(origin, deps.projects().list()));
  return {
    name: "trash",
    api: trashBin,
    routes: [trashRoutes({ projectParam: idParam((id) => deps.projects().get(id), "プロジェクトが見つかりません"), items, trashBin })],
    start: () => trashBin.start(),
    stop: () => trashBin.close(),
  };
}
