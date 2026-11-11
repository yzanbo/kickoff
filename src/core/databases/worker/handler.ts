// DB ワーカーの中身: 頼みを受けて、名前ごとの接続（session）で流す。プロセスとのつなぎは main.ts（テストでは同じプロセスで使う）
import { erTableOf } from "@shared/database/erDiagram";
import { errorMessage } from "@shared/errors";
import { DB_ER_AUTO_MAX, DB_ER_MAX, type DbErSchema, type DbObjectPath } from "@shared/types";
import type { DbTarget, WorkerMethod, WorkerMethods, WorkerRequest, WorkerResponse } from "../protocol.js";
import type { DbDriver } from "./driver.js";
import { openMysql } from "./mysql.js";
import { openPostgres } from "./postgres.js";
import { openSqlite, testSqlite } from "./sqlite.js";
import { createTunnels } from "./tunnel.js";

type Tunnels = ReturnType<typeof createTunnels>;

/** つなぐ（SSH トンネルを使う接続は、トンネルを開いて手元のポートへ。使ったトンネルの key も返す） */
async function openVia(target: DbTarget, tunnels: Tunnels): Promise<{ driver: DbDriver; tunnel: string | null }> {
  if (!target.ssh || target.engine === "sqlite") return { driver: await openDriver(target), tunnel: null };
  const { key, port } = await tunnels.acquire({
    ssh: target.ssh,
    remote_host: target.host ?? "localhost",
    remote_port: target.port ?? (target.engine === "postgres" ? 5432 : 3306),
  });
  try {
    return { driver: await openDriver({ ...target, host: "127.0.0.1", port, ssh: null, tls_host: target.host }), tunnel: key };
  } catch (e) {
    // 踏み台から DB につなげないと、DB のドライバには「切れた」としか届かない。ssh の文が遅れて届くのを少し待って添える
    await new Promise((r) => setTimeout(r, 300));
    const failure = tunnels.forwardFailure(key);
    tunnels.release(key);
    if (failure) throw new Error(`SSH トンネルは開きましたが、踏み台から DB（${target.host ?? "localhost"}:${target.port ?? "既定のポート"}）につながりません（ホスト・ポートは踏み台から見た場所です）: ${failure}`);
    throw e;
  }
}

/** 種類ごとの開き方 */
async function openDriver(target: DbTarget): Promise<DbDriver> {
  switch (target.engine) {
    case "sqlite":
      return openSqlite(target);
    case "postgres":
      return openPostgres(target);
    case "mysql":
      return openMysql(target);
  }
}

async function testTarget(target: DbTarget, tunnels: Tunnels): Promise<string | null> {
  if (target.engine === "sqlite") return testSqlite(target);
  const { driver, tunnel } = await openVia(target, tunnels);
  try {
    return await driver.serverVersion();
  } finally {
    await driver.close();
    if (tunnel) tunnels.release(tunnel);
  }
}

/**
 * ER 図の中身: 場所のテーブル・ビューの名前すべてと、描くものの構造（names が null なら DB_ER_AUTO_MAX 以下のときだけすべて。
 * 多すぎれば空で返し、画面が選ばせる。描くのは DB_ER_MAX まで）
 */
async function erSchema(d: DbDriver, path: DbObjectPath, names: string[] | null): Promise<DbErSchema> {
  const all = (await d.objects(path)).filter((o) => o.kind === "table" || o.kind === "view").map((o) => o.name);
  const known = new Set(all);
  const pick = names ? names.filter((n) => known.has(n)) : all.length <= DB_ER_AUTO_MAX ? all : [];
  const tables = [];
  for (const name of pick.slice(0, DB_ER_MAX)) tables.push(erTableOf(name, await d.table(path, name)));
  return { names: all, tables };
}

interface OpenSession {
  driver: DbDriver;
  /** 使っている SSH トンネル（なければ null） */
  tunnel: string | null;
  /** つないだ先の指紋（変わったら、トランザクションの途中でなければつなぎ直す） */
  fingerprint: string;
}

type Handlers = { [M in WorkerMethod]: (params: WorkerMethods[M]["params"], id: number) => Promise<WorkerMethods[M]["result"]> };

/** ワーカーの中身（頼みを流す handle・止める cancel・すべて閉じる closeAll） */
export function createWorkerHandler() {
  const sessions = new Map<string, OpenSession>();
  const tunnels = createTunnels();
  /** 接続を閉じ、使っていたトンネルを返す */
  const closeSession = async (open: OpenSession) => {
    await open.driver.close().catch(() => {});
    if (open.tunnel) tunnels.release(open.tunnel);
  };
  /** 流している頼み（id → 使っている接続。止めるときに使う） */
  const running = new Map<number, DbDriver>();

  /** 名前の接続を返す（なければ開く。つなぐ先が変わっていれば、トランザクションの途中でなければ開き直す） */
  const sessionOf = async (name: string, target: DbTarget): Promise<DbDriver> => {
    const fingerprint = JSON.stringify(target);
    const open = sessions.get(name);
    if (open && open.fingerprint === fingerprint && open.driver.alive()) return open.driver;
    if (open) {
      if (open.driver.alive() && open.driver.inTransaction()) throw new Error("トランザクションの途中なので、つなぎ方を変えられません。先にコミットか取り消しをしてください");
      sessions.delete(name);
      await closeSession(open);
    }
    const { driver, tunnel } = await openVia(target, tunnels);
    sessions.set(name, { driver, tunnel, fingerprint });
    return driver;
  };
  const existing = (name: string) => sessions.get(name)?.driver ?? null;

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
      const driver = await sessionOf(name, target);
      running.set(id, driver);
      return fn(driver);
    });

  const handlers: Handlers = {
    test: async ({ target }) => ({ server_version: await testTarget(target, tunnels) }),
    databases: (p, id) => use(id, p.session, p.target, (d) => d.databases()),
    schemas: (p, id) => use(id, p.session, p.target, (d) => d.schemas(p.database)),
    objects: (p, id) => use(id, p.session, p.target, (d) => d.objects(p.path)),
    table: (p, id) => use(id, p.session, p.target, (d) => d.table(p.path, p.name)),
    definition: (p, id) => use(id, p.session, p.target, (d) => d.definition(p.path, p.kind, p.name)),
    er: (p, id) => use(id, p.session, p.target, (d) => erSchema(d, p.path, p.names)),
    rows: (p, id) => use(id, p.session, p.target, (d) => d.rows(p.path, p.name, p.sort, p.offset, p.limit, p.filter)),
    count: (p, id) => use(id, p.session, p.target, async (d) => ({ count: await d.count(p.path, p.name, p.filter) })),
    outline: (p, id) => use(id, p.session, p.target, (d) => d.outline(p.path)),
    query: (p, id) => use(id, p.session, p.target, (d) => d.query(p.sql, p.max_rows)),
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
    close: async ({ session }) => {
      const open = sessions.get(session);
      sessions.delete(session);
      if (open) await closeSession(open);
      return { closed: Boolean(open) };
    },
    closeMatching: async ({ prefixes }) => {
      const names = [...sessions.keys()].filter((name) => prefixes.some((p) => name.startsWith(p)));
      for (const name of names) {
        const open = sessions.get(name)!;
        sessions.delete(name);
        await closeSession(open);
      }
      return { closed: names.length };
    },
  };

  return {
    async handle(req: WorkerRequest): Promise<WorkerResponse> {
      try {
        const result = await (handlers[req.method] as (p: unknown, id: number) => Promise<unknown>)(req.params, req.id);
        return { id: req.id, ok: true, result };
      } catch (e) {
        return { id: req.id, ok: false, error: errorMessage(e) };
      } finally {
        running.delete(req.id);
      }
    },
    /** 流している頼みを止める（DB に止めるよう頼む。止められない種類は何もしない） */
    async cancel(id: number) {
      await running.get(id)?.cancel();
    },
    async closeAll() {
      for (const { driver } of sessions.values()) await driver.close().catch(() => {});
      sessions.clear();
      tunnels.closeAll();
    },
  };
}
