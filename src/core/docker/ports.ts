// 静かなぶつかり（Docker の外のプロセスが同じポートで待っている）を調べる口と、Homebrew のサービスを止める口。
// 待っているソケット（OS の口）・brew は外のコマンドなので、テストでは probe を差し替える
import type { DockerSilentConflict } from "@shared/types";
import type { ListeningSocket } from "../platform/types.js";
import { findExecutable, runCommand, searchDirs } from "../system/exec.js";
import { brewServicePids, silentConflictsOf } from "./portConflict.js";

/** Homebrew のサービスの一覧を覚える時間（ぶつかりがあるときだけ聞く） */
const BREW_TTL_MS = 30_000;

export interface PortProbe {
  /** TCP のポートを待っているソケット（HostPlatform の listeningSockets） */
  listeningSockets: () => Promise<ListeningSocket[]>;
  /** `brew services info --all --json` の出力（brew がなければ "[]"） */
  brewServices: () => Promise<string>;
  /** `brew services stop <名前>` */
  brewStop: (name: string) => Promise<void>;
}

const brewBin = () => findExecutable(["brew"], searchDirs());

const brewProbe: Omit<PortProbe, "listeningSockets"> = {
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

  probe: PortProbe;

  constructor(listeningSockets: PortProbe["listeningSockets"]) {
    this.probe = { listeningSockets, ...brewProbe };
  }

  /**
   * コンテナ（ID → Mac に出しているポート）ごとの静かなぶつかり。待っているソケットは 1 回だけ調べ、ぶつかりがあるときだけ Homebrew のサービスを聞く。
   * 調べられなければ空
   */
  async silent(portsById: ReadonlyMap<string, number[]>): Promise<Record<string, DockerSilentConflict[]>> {
    const all = [...portsById.values()].flat();
    if (all.length === 0) return {};
    let sockets;
    try {
      sockets = await this.probe.listeningSockets();
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
