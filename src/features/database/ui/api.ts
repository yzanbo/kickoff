// DB クライアントの API の呼び手（取り決めは @shared/database/contract.ts。この Mac のアプリの中だけで、ほかからは 403）。
// locked のルートは、保存したパスワードをキーチェーンで開けなければ（409 の db_password_locked）利用者に聞き、入れてもらえたらやり直す
import { databaseContract } from "@shared/database/contract";
import { DB_PASSWORD_LOCKED } from "@shared/database/types";
import type { RouteKey } from "@shared/foundation/contract";
import { client, type ApiClient, type CallOptions } from "@/foundation/ui/api/client";
import { ApiError } from "@/foundation/ui/api/http";
import { askDbPassword } from "./connection/askDbPassword";

type DbContract = typeof databaseContract;
type LooseInput = { params?: { projectId?: number; connectionId?: number }; body?: { connection_id?: number | null } };

const raw = client(databaseContract);

/** つなぐ頼み: 保存したパスワードを開けなければ利用者に入れてもらい、やり直す（やめたら失敗のまま） */
async function unlocking<T>(projectId: number, connectionId: number | null | undefined, call: () => Promise<T>): Promise<T> {
  for (;;) {
    try {
      return await call();
    } catch (e) {
      const locked = e instanceof ApiError && e.code === DB_PASSWORD_LOCKED;
      if (!locked || !projectId || !connectionId || !(await askDbPassword(projectId, connectionId))) throw e;
    }
  }
}

/** DB の呼び手（接続は :connectionId か、試すの本文の connection_id） */
export const dbApi = Object.assign(
  (key: RouteKey<DbContract>, input?: LooseInput, options?: CallOptions) => {
    const call = () => (raw as unknown as (k: string, i?: unknown, o?: CallOptions) => Promise<unknown>)(key, input, options);
    if (!databaseContract[key].marks?.locked) return call();
    return unlocking(input?.params?.projectId ?? 0, input?.params?.connectionId ?? input?.body?.connection_id, call);
  },
  { url: raw.url },
) as unknown as ApiClient<DbContract>;

/** 接続のルートの入力（:projectId と :connectionId） */
export const dbOne = (projectId: number, connectionId: number) => ({ params: { projectId, connectionId } });

/** 接続の作業場所のルートの入力（?worktree=。null は本体） */
export const dbAt = (projectId: number, connectionId: number, worktree: string | null) => ({ params: { projectId, connectionId }, query: { worktree: worktree ?? undefined } });

/** SQL のタブの接続のルートの入力（:session はタブのキー） */
export const dbSession = (projectId: number, connectionId: number, session: string) => ({ params: { projectId, connectionId, session } });
