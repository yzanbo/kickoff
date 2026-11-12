// docker コマンドの呼び方（探す場所・環境変数・エンジンの様子）。コアの外部コマンドの決まり（runCommand / streamCommand）を通す
import os from "node:os";
import path from "node:path";
import { CommandError, findExecutable, runCommand, searchDirs } from "../system/exec.js";
import { streamCommand, type StreamOptions, type StreamedCommand } from "../system/stream.js";

/** docker の実行ファイル（PATH・Homebrew に加えて OrbStack の場所も探す。見つからなければ null） */
export function findDocker(): string | null {
  return findExecutable(["docker"], [...searchDirs(), path.join(os.homedir(), ".orbstack", "bin"), "/Applications/Docker.app/Contents/Resources/bin"]);
}

/** OrbStack の orb コマンド（アプリが開いたままエンジンだけ止まっていると、open -a では起動しないため orb start で起こす） */
export function findOrb(): string | null {
  return findExecutable(["orb"], [...searchDirs(), path.join(os.homedir(), ".orbstack", "bin")]);
}

/** docker に渡す環境（ヒントの文を出させない） */
export const dockerEnv = (extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({ ...process.env, DOCKER_CLI_HINTS: "false", ...extra });

/** docker を呼ぶ口（テストでは偽の docker のパスを渡す） */
export class DockerCli {
  constructor(private readonly resolve: () => string | null = findDocker) {}

  /** いま使う docker（見つからなければ null） */
  bin(): string | null {
    return this.resolve();
  }

  /** すぐ終わるコマンド（ps・start・stop・config など）。失敗は CommandError */
  async run(args: string[], { cwd, timeout = 60_000, env }: { cwd?: string; timeout?: number; env?: NodeJS.ProcessEnv } = {}): Promise<string> {
    const bin = this.bin();
    if (!bin) throw new CommandError(Object.assign(new Error("Docker が入っていません"), { code: "ENOENT" }));
    return runCommand(bin, args, { cwd, timeout, env: dockerEnv(env) });
  }

  /** 流れ続けるコマンド（docker events・中止できる up -d）。見つからなければ null */
  stream(args: string[], opts: StreamOptions = {}): StreamedCommand | null {
    const bin = this.bin();
    return bin ? streamCommand(bin, args, { ...opts, env: dockerEnv(opts.env) }) : null;
  }

  /** エンジンが答えるか（止まっていると待たされることがあるので 5 秒で打ち切り、打ち切ったら止まっているとみなす） */
  async engineUp(): Promise<boolean> {
    try {
      await this.run(["version", "--format", "{{.Server.Version}}"], { timeout: 5_000 });
      return true;
    } catch {
      return false;
    }
  }

  /** いまの context の名前（取れなければ null） */
  async context(): Promise<string | null> {
    try {
      return (await this.run(["context", "show"], { timeout: 5_000 })).trim() || null;
    } catch {
      return null;
    }
  }
}

/** シェルの 1 語にする（［ターミナルで流し直す］のコマンド） */
export const shellWord = (s: string) => (/^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`);
