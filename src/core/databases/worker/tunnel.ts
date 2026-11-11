// 手元のポートへのトンネル（DB ワーカーの中）: SSH トンネル（この Mac の ssh -L）と、ポートを転送するコマンド（aws ssm start-session など）。
// どちらも 127.0.0.1 の空いたポートに転送し、同じ行き先へのトンネルは使っている接続があるあいだ 1 本を使い回し、使う接続がなくなったら止める。
// SSH のサーバーの鍵は StrictHostKeyChecking=yes（初めてのサーバーはつながず、コアが画面で指紋を確かめてから known_hosts に足す）
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { expandPrepCommand, type DbPrepVars } from "@shared/database/dbPrep";
import { DB_SSH_UNKNOWN_HOST, type DbSsh } from "@shared/types";
import { isChangedHostKey, isUnknownHostKey, sshTargetArgs } from "../sshArgs.js";
import { killTree, spawnShell } from "./shell.js";

/** SSH で手元のポートにつながるまで待つ時間（ミリ秒。踏み台の起動・ログインを含む） */
const SSH_TIMEOUT_MS = 30_000;
/** ポートを転送するコマンドで待つ時間（SSM などは起動に時間がかかる） */
const COMMAND_TIMEOUT_MS = 60_000;

export interface TunnelSpec {
  ssh: DbSsh & { password: string | null };
  /** 踏み台から見た DB の場所 */
  remote_host: string;
  remote_port: number;
}

/** ポートを転送するコマンド（{local_port} はここで埋める） */
export interface CommandTunnelSpec {
  connection_id: number;
  command: string;
  vars: DbPrepVars;
}

interface OpenTunnel {
  proc: ChildProcess;
  port: number;
  users: number;
  ready: Promise<number>;
  /** 標準エラー（コマンドは標準出力も）の終わりのほう（失敗の文・転送の失敗を見分ける） */
  stderr: string;
}

/** 空いているポート（いったん開いて閉じる） */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

/** 手元のポートに TCP でつながるか */
const canConnect = (port: number) =>
  new Promise<boolean>((resolve) => {
    const socket = net.connect(port, "127.0.0.1");
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });

/** SSH のパスワードを ssh に渡す SSH_ASKPASS の小さなスクリプト（環境変数から出すだけ。パスワードはファイルに書かない） */
let askpassFile: string | null = null;
function askpass(): string {
  if (askpassFile && fs.existsSync(askpassFile)) return askpassFile;
  askpassFile = path.join(os.tmpdir(), `kickoff-askpass-${process.pid}.sh`);
  fs.writeFileSync(askpassFile, '#!/bin/sh\nprintf "%s\\n" "$KICKOFF_SSH_PASSWORD"\n', { mode: 0o700 });
  return askpassFile;
}

const lastLines = (text: string) => text.trim().split("\n").filter(Boolean).slice(-3).join(" / ");

/** ssh の失敗の文を、画面に出す文にする（初めてのサーバーは DB_SSH_UNKNOWN_HOST の印を頭に付ける。コアが見分ける） */
export function tunnelError(host: string, stderr: string): string {
  const detail = lastLines(stderr);
  if (isChangedHostKey(stderr)) {
    return `踏み台（${host}）のサーバーの鍵が、前に受け入れたものと違います。サーバーを入れ替えたのでなければつながないでください（入れ替えたなら ~/.ssh/known_hosts の古い鍵を消してください）`;
  }
  if (isUnknownHostKey(stderr)) return `${DB_SSH_UNKNOWN_HOST}: 踏み台（${host}）は初めてつなぐサーバーです。サーバーの鍵の指紋を確かめてから受け入れてください`;
  if (/Permission denied/i.test(stderr)) return `踏み台（${host}）にログインできません（鍵・ユーザー・パスワード・ssh-agent を確かめてください）: ${detail}`;
  return `SSH トンネルを開けませんでした（${host}）: ${detail || "ssh が終わりました"}`;
}

/** SSH で転送する ssh を起動する */
function spawnSsh(spec: TunnelSpec, port: number): ChildProcess {
  const env: NodeJS.ProcessEnv = { ...process.env };
  const options = ["-o", "ExitOnForwardFailure=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=15", "-o", "ServerAliveInterval=30"];
  if (spec.ssh.password) {
    Object.assign(env, { SSH_ASKPASS: askpass(), SSH_ASKPASS_REQUIRE: "force", DISPLAY: env.DISPLAY ?? ":0", KICKOFF_SSH_PASSWORD: spec.ssh.password });
    options.push("-o", "NumberOfPasswordPrompts=1");
  } else options.push("-o", "BatchMode=yes");
  return spawn("ssh", ["-N", "-L", `127.0.0.1:${port}:${spec.remote_host}:${spec.remote_port}`, ...options, ...sshTargetArgs(spec.ssh)], { stdio: ["ignore", "ignore", "pipe"], env });
}

export function createTunnels(opts: { onCommandRun?: (spec: CommandTunnelSpec, ok: boolean) => void } = {}) {
  const tunnels = new Map<string, OpenTunnel>();

  /** 起動して、手元のポートにつながるまで待つ（先に終わったら errorOf の文で失敗） */
  const start = (key: string, launch: (port: number) => ChildProcess, errorOf: (output: string) => string, timeoutMs: number): OpenTunnel => {
    const entry = { users: 0, stderr: "" } as OpenTunnel;
    entry.ready = (async () => {
      const port = await freePort();
      const proc = launch(port);
      entry.proc = proc;
      entry.port = port;
      let exited = false;
      const add = (d: Buffer) => (entry.stderr = (entry.stderr + d.toString()).slice(-4000));
      proc.stdout?.on("data", add);
      proc.stderr?.on("data", add);
      proc.once("exit", () => {
        exited = true;
        if (tunnels.get(key) === entry) tunnels.delete(key);
      });
      proc.once("error", (e) => {
        exited = true;
        entry.stderr += e.message;
      });
      const end = Date.now() + timeoutMs;
      while (Date.now() < end) {
        if (exited) throw new Error(errorOf(entry.stderr));
        if (await canConnect(port)) return port;
        await new Promise((r) => setTimeout(r, 150));
      }
      killTree(proc.pid);
      throw new Error(`${errorOf("")}（${timeoutMs / 1000} 秒たってもつながりません）`);
    })();
    // 開けなければ、次の頼みで開き直す
    entry.ready.catch(() => {
      if (tunnels.get(key) === entry) tunnels.delete(key);
    });
    return entry;
  };

  const use = async (key: string, create: () => OpenTunnel): Promise<{ key: string; port: number }> => {
    let entry = tunnels.get(key);
    // 終わったトンネルは exit で一覧から外れる
    if (!entry) {
      entry = create();
      tunnels.set(key, entry);
    }
    entry.users++;
    try {
      return { key, port: await entry.ready };
    } catch (e) {
      entry.users--;
      throw e;
    }
  };

  return {
    /** SSH トンネルを使う（なければ開く）。返す key で release する */
    acquire(spec: TunnelSpec): Promise<{ key: string; port: number }> {
      const key = JSON.stringify(["ssh", spec.ssh, spec.remote_host, spec.remote_port]);
      return use(key, () => start(key, (port) => spawnSsh(spec, port), (out) => tunnelError(spec.ssh.host, out), SSH_TIMEOUT_MS));
    },
    /** ポートを転送するコマンドを使う（なければ流す。{local_port} に空いたポートを入れる） */
    acquireCommand(spec: CommandTunnelSpec): Promise<{ key: string; port: number }> {
      const key = JSON.stringify(["command", spec.connection_id, spec.command, spec.vars]);
      return use(key, () => {
        const entry = start(
          key,
          (port) => spawnShell(expandPrepCommand(spec.command, { ...spec.vars, local_port: String(port) })),
          (out) => `ポートを転送するコマンドで、手元のポートにつながりませんでした${out ? `: ${lastLines(out)}` : ""}`,
          COMMAND_TIMEOUT_MS,
        );
        entry.ready.then(
          () => opts.onCommandRun?.(spec, true),
          () => opts.onCommandRun?.(spec, false),
        );
        return entry;
      });
    },
    /** 踏み台・コマンドから DB への転送が失敗したときの文（「channel 2: open failed: connect failed: …」。なければ null） */
    forwardFailure(key: string): string | null {
      const lines = tunnels.get(key)?.stderr.split("\n") ?? [];
      return lines.reverse().find((l) => /open failed|connect failed|administratively prohibited/i.test(l))?.trim() ?? null;
    },
    /** 使い終わった（使う接続がなくなったら止める） */
    release(key: string) {
      const entry = tunnels.get(key);
      if (!entry) return;
      entry.users--;
      if (entry.users <= 0) {
        tunnels.delete(key);
        killTree(entry.proc?.pid);
      }
    },
    closeAll() {
      for (const entry of tunnels.values()) killTree(entry.proc?.pid);
      tunnels.clear();
    },
  };
}
