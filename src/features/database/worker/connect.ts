// つなぐ: 種類ごとの開き方（流し方と読み方を組む）と、パスワードを取るコマンド・ポートを転送するコマンド・SSH トンネルを通す開き方
import { DB_DEFAULT_PORTS } from "@shared/database/types";
import type { DbTarget } from "@shared/database/workerProtocol";
import { driverOf } from "./common";
import type { DbDriver } from "./driver";
import type { Prep } from "./prep";
import { openSqlite, sqliteCatalog } from "./sqlite";
import type { createTunnels } from "./tunnel";
import { isFileDb } from "@shared/database/connectionShape";

type Tunnels = ReturnType<typeof createTunnels>;

/** 種類ごとの開き方（pg・mysql2 は使うときに読む。SQLite だけ使う間はワーカーの起動で読み込まない） */
export async function openDriver(target: DbTarget): Promise<DbDriver> {
  switch (target.engine) {
    case "sqlite":
      return driverOf("sqlite", openSqlite(target), sqliteCatalog);
    case "postgres": {
      const [{ openPostgres }, { postgresCatalog }] = await Promise.all([import("./postgres/conn"), import("./postgres/catalog")]);
      return driverOf("postgres", await openPostgres(target), postgresCatalog);
    }
    case "mysql": {
      const [{ openMysql }, { mysqlCatalog }] = await Promise.all([import("./mysql/conn"), import("./mysql/catalog")]);
      return driverOf("mysql", await openMysql(target), mysqlCatalog);
    }
  }
}

/**
 * つなぐ。パスワードを取るコマンドがあれば流してパスワードにし、ポートを転送するコマンド・SSH トンネルを使う接続は、
 * トンネルを開いて手元のポートへ（ポートを転送するコマンドが先）。使ったトンネルの key も返す
 */
export async function openVia(target: DbTarget, tunnels: Tunnels, prep: Prep): Promise<{ driver: DbDriver; tunnel: string | null }> {
  if (isFileDb(target.engine)) return { driver: await openDriver(target), tunnel: null };
  const commands = target.commands ?? null;
  const base: DbTarget = { ...target, password: commands?.password ? await prep.password(commands) : target.password, commands: null, ssh: null };
  const remote = `${target.host ?? "localhost"}:${target.port ?? "既定のポート"}`;
  let acquired: { key: string; port: number } | null = null;
  let via: string;
  if (commands?.tunnel) {
    acquired = await tunnels.acquireCommand({ connection_id: commands.connection_id, command: commands.tunnel, vars: await prep.varsFor(commands, commands.tunnel) });
    via = `ポートを転送するコマンドは流れましたが、その先の DB（${remote}）につながりません`;
  } else if (target.ssh) {
    acquired = await tunnels.acquire({ ssh: target.ssh, remote_host: target.host ?? "localhost", remote_port: target.port ?? DB_DEFAULT_PORTS[target.engine] ?? 0 });
    via = `SSH トンネルは開きましたが、踏み台から DB（${remote}）につながりません（ホスト・ポートは踏み台から見た場所です）`;
  } else return { driver: await openDriver(base), tunnel: null };
  try {
    return { driver: await openDriver({ ...base, host: "127.0.0.1", port: acquired.port, tls_host: target.host }), tunnel: acquired.key };
  } catch (e) {
    // トンネルの先の DB につなげないと、DB のドライバには「切れた」としか届かない。トンネルの文が遅れて届くのを少し待って添える
    await new Promise((r) => setTimeout(r, 300));
    const failure = tunnels.forwardFailure(acquired.key);
    tunnels.release(acquired.key);
    if (failure) throw new Error(`${via}: ${failure}`);
    throw e;
  }
}

/** つながるか試す（いつも読み取り専用で開いて版を聞き、閉じる） */
export async function testTarget(target: DbTarget, tunnels: Tunnels, prep: Prep): Promise<string | null> {
  const { driver, tunnel } = await openVia({ ...target, read_only: true }, tunnels, prep);
  try {
    return await driver.serverVersion();
  } finally {
    await driver.close();
    if (tunnel) tunnels.release(tunnel);
  }
}
