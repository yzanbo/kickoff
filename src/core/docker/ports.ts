// 静かなぶつかり（Docker の外のプロセスが同じポートで待っている）を調べる口と、Homebrew のサービスを止める口。
// lsof・brew は外のコマンドなので、テストでは probe を差し替える
import type { DockerSilentConflict } from "@shared/types";
import { findExecutable, runCommand, searchDirs } from "../system/exec.js";
import { brewServicePids, parseLsof, silentConflictsOf } from "./portConflict.js";

/** Homebrew のサービスの一覧を覚える時間（ぶつかりがあるときだけ聞く） */
const BREW_TTL_MS = 30_000;

export interface PortProbe {
  /** `lsof -nP +c 0 -iTCP -sTCP:LISTEN` の出力（+c 0 がないとコマンド名が 9 文字で切られ、エンジンかを見分けられない） */
  lsof: () => Promise<string>;
  /** `brew services info --all --json` の出力（brew がなければ "[]"） */
  brewServices: () => Promise<string>;
  /** `brew services stop <名前>` */
  brewStop: (name: string) => Promise<void>;
}

const brewBin = () => findExecutable(["brew"], searchDirs());

export const defaultPortProbe: PortProbe = {
  lsof: () => runCommand("/usr/sbin/lsof", ["-nP", "+c", "0", "-iTCP", "-sTCP:LISTEN"], { okCodes: [1], timeout: 5_000 }),
  brewServices: async () => {
    const brew = brewBin();
    return brew ? runCommand(brew, ["services", "info", "--all", "--json"], { timeout: 15_000 }) : "[]";
  },
  brewStop: async (name) => {
    const brew = brewBin();
    if (!brew) throw new Error("brew が見つかりません");
    await runCommand(brew, ["services", "stop", name], { timeout: 60_000 });
  },
};

export class DockerPorts {
  private brew: { at: number; pids: Map<number, string> } | null = null;

  constructor(public probe: PortProbe = defaultPortProbe) {}

  /**
   * コンテナ（ID → Mac に出しているポート）ごとの静かなぶつかり。lsof は 1 回だけ流し、ぶつかりがあるときだけ Homebrew のサービスを聞く。
   * 調べられなければ（lsof がない・失敗）空
   */
  async silent(portsById: ReadonlyMap<string, number[]>): Promise<Record<string, DockerSilentConflict[]>> {
    const all = [...portsById.values()].flat();
    if (all.length === 0) return {};
    let sockets;
    try {
      sockets = parseLsof(await this.probe.lsof());
    } catch {
      return {};
    }
    if (silentConflictsOf(all, sockets).length === 0) return {};
    const brew = await this.brewPids();
    const out: Record<string, DockerSilentConflict[]> = {};
    for (const [id, ports] of portsById) {
      const found = silentConflictsOf(ports, sockets, brew);
      if (found.length) out[id] = found;
    }
    return out;
  }

  /** Homebrew のサービスを止める（止めたら覚えた一覧を捨てる） */
  async stopBrew(name: string): Promise<void> {
    await this.probe.brewStop(name);
    this.brew = null;
  }

  private async brewPids(): Promise<Map<number, string>> {
    if (this.brew && Date.now() - this.brew.at < BREW_TTL_MS) return this.brew.pids;
    let pids = new Map<number, string>();
    try {
      pids = brewServicePids(await this.probe.brewServices());
    } catch {
      // brew が答えなければ、Homebrew のサービスとは見なさない
    }
    this.brew = { at: Date.now(), pids };
    return pids;
  }
}
