// DB クライアントのドライバ（PostgreSQL・MySQL・MariaDB）を、Docker で立てた本物の DB で確かめる（npm run test:db）。
// 立てるコンテナは 127.0.0.1 の空いているポートだけに開き、終わったら（失敗しても）消す。npm test には入れない（Docker が要り、時間がかかるため）
import { execFileSync, spawnSync } from "node:child_process";
import net from "node:net";

const PASSWORD = "kickoff-test";
const tag = `kickoff-dbtest-${process.pid}`;

/** 立てる DB（image は手元になければ docker が取ってくる） */
const SERVERS = [
  { key: "PG", image: "postgres:16", port: 5432, env: { POSTGRES_PASSWORD: PASSWORD } },
  { key: "MYSQL", image: "mysql:8.4", port: 3306, env: { MYSQL_ROOT_PASSWORD: PASSWORD, MYSQL_DATABASE: "kickoff" } },
  { key: "MARIADB", image: "mariadb:11", port: 3306, env: { MARIADB_ROOT_PASSWORD: PASSWORD, MARIADB_DATABASE: "kickoff" } },
];

const docker = (...args) => execFileSync("docker", args, { encoding: "utf8" }).trim();

/** ポートが受け付けるまで待つ */
async function waitPort(port, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const ok = await new Promise((resolve) => {
      const s = net.connect(port, "127.0.0.1", () => (s.destroy(), resolve(true)));
      s.on("error", () => resolve(false));
    });
    if (ok) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`port ${port} did not open`);
}

const started = [];
let status = 1;
try {
  const env = { ...process.env, KICKOFF_DBTEST_PASSWORD: PASSWORD };
  for (const s of SERVERS) {
    const name = `${tag}-${s.key.toLowerCase()}`;
    const envArgs = Object.entries(s.env).flatMap(([k, v]) => ["-e", `${k}=${v}`]);
    docker("run", "-d", "--rm", "--name", name, "-p", `127.0.0.1::${s.port}`, ...envArgs, s.image);
    started.push(name);
    const port = Number(docker("port", name, String(s.port)).split("\n")[0].split(":").pop());
    env[`KICKOFF_DBTEST_${s.key}_PORT`] = String(port);
    console.log(`${s.image} → 127.0.0.1:${port}`);
  }
  for (const s of SERVERS) await waitPort(Number(env[`KICKOFF_DBTEST_${s.key}_PORT`]), 120_000);
  // ポートが開いても初期化の途中のことがあるので、テストの側でつながるまで待つ
  const r = spawnSync(process.execPath, ["--import", "tsx", "--test", "--test-concurrency=1", "src/**/*.dbtest.ts"], { stdio: "inherit", env });
  status = r.status ?? 1;
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
} finally {
  for (const name of started) spawnSync("docker", ["rm", "-f", name], { stdio: "ignore" });
}
process.exit(status);
