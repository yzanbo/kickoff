// DB ワーカーの中身: 頼みを受けて、名前ごとの接続（session）で流す。プロセスとのつなぎは main.ts（テストでは同じプロセスで使う）
import { errorMessage } from "@shared/foundation/errors";
import { parseSession } from "@shared/database/session";
import { DB_SESSION_IDLE_MS } from "@shared/database/types";
import { DbWorkerError, type DbTarget, type WorkerMethod, type WorkerMethods, type WorkerRequest, type WorkerResponse } from "@shared/database/workerProtocol";
import { erSchema } from "./common";
import { openVia, testTarget } from "./connect";
import type { DbDriver } from "./driver";
import { createPrep, type EmitRun } from "./prep";
import { createTunnels } from "./tunnel";
import { exportQuery } from "./csvExport";

/** 当たった行の数が違うときの文 */
function expectError(index: number, affected: number) {
  return affected === 0
    ? `${index + 1} 番目の変更の行が見つかりません（ほかで変わったか、消えたのかもしれません）。すべて取り消しました`
    : `${index + 1} 番目の変更が ${affected} 行に当たりました（行を 1 つに決められません）。すべて取り消しました`;
}

/** 文をまとめて 1 つのトランザクションで流す（失敗・当たった行の数の違いで、すべて取り消す） */
async function applyStatements(d: DbDriver, statements: WorkerMethods["apply"]["params"]["statements"]) {
  const started = performance.now();
  if (d.inTransaction()) throw new Error("トランザクションの途中なので保存できません");
  await d.execute("BEGIN", []);
  const affected: number[] = [];
  try {
    for (const [i, s] of statements.entries()) {
      let n: number;
      try {
        n = await d.execute(s.sql, s.params);
      } catch (e) {
        throw new Error(`${i + 1} 番目の変更で失敗しました。すべて取り消しました: ${errorMessage(e)}`);
      }
      if (s.expect !== null && n !== s.expect) throw new Error(expectError(i, n));
      affected.push(n);
    }
    await d.execute("COMMIT", []);
  } catch (e) {
    await d.execute("ROLLBACK", []).catch(() => {});
    throw e;
  }
  return { affected, duration_ms: performance.now() - started };
}

/** 使っていない接続を見る間隔 */
export const IDLE_SWEEP_MS = 60_000;

interface OpenSession {
  driver: DbDriver;
  /** 最後に使った時刻（使っていない接続を閉じる） */
  usedAt: number;
  /** 使っている SSH トンネル（なければ null） */
  tunnel: string | null;
  /** つないだ先の指紋（変わったら、トランザクションの途中でなければつなぎ直す） */
  fingerprint: string;
}

/** 接続（セッション）の名前から、どの接続のものか（分からなければ null） */
const connectionIdOfSession = (name: string): number | null => parseSession(name)?.connectionId ?? null;

type Handlers = { [M in WorkerMethod]: (params: WorkerMethods[M]["params"], id: number) => Promise<WorkerMethods[M]["result"]> };

/** ワーカーの中身（頼みを流す handle・止める cancel・使っていない接続を閉じる closeIdle・すべて閉じる closeAll） */
export function createWorkerHandler(emit: EmitRun = () => {}, opts: { sessionIdleMs?: number; now?: () => number } = {}) {
  const sessionIdleMs = opts.sessionIdleMs ?? DB_SESSION_IDLE_MS;
  const now = opts.now ?? Date.now;
  const sessions = new Map<string, OpenSession>();
  const prep = createPrep(emit);
  const tunnels = createTunnels({
    onCommandRun: (spec, ok) => emit({ event: "prep_run", connection_id: spec.connection_id, kind: "tunnel", command: spec.command, ok }),
  });
  /** 名前の接続を覚えから外して閉じ、使っていたトンネルを返す（閉じたことをコアに知らせる。接続の状態の知らせ） */
  const dropSession = async (name: string) => {
    const open = sessions.get(name);
    if (!open) return false;
    sessions.delete(name);
    emit({ event: "session", name, open: false });
    await open.driver.close().catch(() => {});
    if (open.tunnel) tunnels.release(open.tunnel);
    return true;
  };
  /** 流している頼み（id → 使っている接続。止めるときに使う） */
  const running = new Map<number, DbDriver>();
  /** 受けてまだ終わっていない頼みの id と、順番を待つ間に止めた頼みの id（順番が来ても流さない） */
  const pending = new Set<number>();
  const cancelled = new Set<number>();

  /** 名前の接続を返す（なければ開く。つなぐ先が変わっていれば、トランザクションの途中でなければ開き直す） */
  const sessionOf = async (name: string, target: DbTarget): Promise<DbDriver> => {
    const fingerprint = JSON.stringify(target);
    const open = sessions.get(name);
    if (open && open.fingerprint === fingerprint && open.driver.alive()) {
      open.usedAt = now();
      return open.driver;
    }
    if (open) {
      if (open.driver.alive() && open.driver.inTransaction()) throw new Error("トランザクションの途中なので、つなぎ方を変えられません。先にコミットか取り消しをしてください");
      await dropSession(name);
    }
    const { driver, tunnel } = await openVia(target, tunnels, prep);
    sessions.set(name, { driver, tunnel, fingerprint, usedAt: now() });
    emit({ event: "session", name, open: true });
    return driver;
  };
  const existing = (name: string) => {
    const open = sessions.get(name);
    if (open) open.usedAt = now();
    return open?.driver ?? null;
  };

  /** 接続ごとの頼みの列（前の頼みが終わってから次を流す） */
  const queues = new Map<string, Promise<unknown>>();
  /**
   * 同じ名前の接続への頼みを 1 つずつ流す。木の段・テーブルのタブは同時に頼むので、並べると、まだない接続を
   * それぞれ開いて 1 本が閉じられずに残り、1 本の接続（pg・mysql2）に文を重ねて送ることになる
   */
  const serial = <T>(name: string, fn: () => Promise<T>): Promise<T> => {
    const next = (queues.get(name) ?? Promise.resolve()).then(fn, fn);
    const tail = next.catch(() => {});
    queues.set(name, tail);
    void tail.then(() => {
      if (queues.get(name) === tail) queues.delete(name);
    });
    return next;
  };
  /** 接続を使う頼み（流している間は止められるよう覚える） */
  const use = <T>(id: number, name: string, target: DbTarget, fn: (d: DbDriver) => Promise<T>) =>
    serial(name, async () => {
      if (cancelled.delete(id)) throw new Error("止めました");
      const driver = await sessionOf(name, target);
      running.set(id, driver);
      return fn(driver);
    });

  const handlers: Handlers = {
    test: async ({ target }) => ({ server_version: await testTarget(target, tunnels, prep) }),
    databases: (p, id) => use(id, p.session, p.target, (d) => d.databases()),
    schemas: (p, id) => use(id, p.session, p.target, (d) => d.schemas(p.database)),
    objects: (p, id) => use(id, p.session, p.target, (d) => d.objects(p.path)),
    table: (p, id) => use(id, p.session, p.target, (d) => d.table(p.path, p.name)),
    definition: (p, id) => use(id, p.session, p.target, (d) => d.definition(p.path, p.kind, p.name)),
    er: (p, id) => use(id, p.session, p.target, (d) => erSchema(d, p.path, p.names)),
    rows: (p, id) => use(id, p.session, p.target, (d) => d.rows(p.path, p.name, p.sort, p.offset, p.limit, p.filter, p.full ?? false)),
    count: (p, id) => use(id, p.session, p.target, async (d) => ({ count: await d.count(p.path, p.name, p.filter) })),
    outline: (p, id) => use(id, p.session, p.target, (d) => d.outline(p.path)),
    query: (p, id) => use(id, p.session, p.target, (d) => d.query(p.sql, p.max_rows, p.skip ?? 0)),
    export: (p, id) => use(id, p.session, p.target, (d) => exportQuery(d, p.sql, p.file, p.head_rows)),
    apply: (p, id) => use(id, p.session, p.target, (d) => applyStatements(d, p.statements)),
    commit: ({ session }) =>
      serial(session, async () => {
        const driver = existing(session);
        await driver?.commit();
        return { in_transaction: driver?.inTransaction() ?? false };
      }),
    rollback: ({ session }) =>
      serial(session, async () => {
        const driver = existing(session);
        await driver?.rollback();
        return { in_transaction: driver?.inTransaction() ?? false };
      }),
    // 閉じるのは待たない（流している文ごと閉じる）
    close: async ({ session }) => ({ closed: await dropSession(session) }),
    closeMatching: async ({ prefixes, cleanup_for }) => {
      const names = [...sessions.keys()].filter((name) => prefixes.some((p) => name.startsWith(p)));
      for (const name of names) await dropSession(name);
      if (cleanup_for !== undefined) await prep.cleanup(cleanup_for);
      return { closed: names.length };
    },
    prepare: async (p) => prep.prepare(p),
    prepState: async ({ connection_id }) => prep.state(connection_id),
    prepCancel: async ({ connection_id }) => prep.cancel(connection_id),
    shutdown: async ({ idle }) => {
      // 準備のコマンド（SSO のログインなど）は頼みのないまま長く流れるので、使っていないからと止めない
      if (idle && prep.busy()) return { done: false };
      await closeAll();
      return { done: true };
    },
  };

  /** すべての接続とトンネルを閉じ、準備した接続の後片付けを流す */
  async function closeAll() {
    for (const name of [...sessions.keys()]) await dropSession(name);
    tunnels.closeAll();
    await prep.cleanupAll();
  }

  /**
   * sessionIdleMs のあいだ使わなかった接続を閉じ、トンネルも返す（トランザクションの途中・流している最中のものは残す）。
   * 閉じた接続の名前を返す
   */
  async function closeIdle(): Promise<string[]> {
    const busy = new Set([...running.values()]);
    const names = [...sessions.entries()]
      .filter(([, open]) => now() - open.usedAt >= sessionIdleMs && !busy.has(open.driver) && !(open.driver.alive() && open.driver.inTransaction()))
      .map(([name]) => name);
    for (const name of names) await dropSession(name);
    // その接続の接続（セッション）がすべて閉じたら、準備の後片付けも流す（IP の許可などを開けっぱなしにしない。仕様の「何もしない状態で自動で切れたときも」）
    const closedIds = new Set(names.map(connectionIdOfSession).filter((id) => id !== null));
    const stillOpen = new Set([...sessions.keys()].map(connectionIdOfSession));
    for (const id of closedIds) if (!stillOpen.has(id) && !prep.state(id)?.running) await prep.cleanup(id);
    return names;
  }

  return {
    closeIdle,
    async handle(req: WorkerRequest): Promise<WorkerResponse> {
      pending.add(req.id);
      try {
        const result = await (handlers[req.method] as (p: unknown, id: number) => Promise<unknown>)(req.params, req.id);
        return { id: req.id, ok: true, result };
      } catch (e) {
        return { id: req.id, ok: false, error: errorMessage(e), ...(e instanceof DbWorkerError && e.code ? { code: e.code } : {}) };
      } finally {
        running.delete(req.id);
        pending.delete(req.id);
        cancelled.delete(req.id);
      }
    },
    /** 流している頼みを止める（DB に止めるよう頼む。止められない種類は何もしない）。順番を待っている頼みは、順番が来ても流さない */
    async cancel(id: number) {
      const driver = running.get(id);
      if (driver) await driver.cancel();
      else if (pending.has(id)) cancelled.add(id);
    },
    closeAll,
  };
}
