// ポートを使っているプロセス（Kickoff のプロジェクトのフォルダで動いていて、TCP のポートを待っているもの）を調べる・止める。
// lsof・ps は外のコマンドなので、テストでは probe を差し替える
import path from "node:path";
import type { PortProcess } from "@shared/types";
import type { Store } from "../db/store.js";
import { listWorktrees } from "../git/worktrees.js";
import { Conflict, NotFound } from "../http/errors.js";
import { runCommand } from "../system/exec.js";
import { LSOF, lsofListening, parseLsof } from "../system/listening.js";
import { realPathLoose } from "../system/paths.js";
import { appBundleOf, bandNotes, originOf, parseCwds, parsePs, selfAndAncestors, selfHelpers, shortCommand, workplaceOf, type BandOwner, type Workplace } from "./parse.js";

export interface ProcessProbe {
  /** `lsof -nP +c 0 -iTCP -sTCP:LISTEN` の出力 */
  lsof: () => Promise<string>;
  /** `ps -A -o pid=,ppid=,etime=,command=` の出力 */
  ps: () => Promise<string>;
  /** `lsof -a -d cwd -p <pid,…> -Fpn` の出力 */
  cwds: (pids: number[]) => Promise<string>;
  /** シグナルを送る */
  kill: (pid: number, signal: "SIGTERM" | "SIGKILL") => void;
  /** まだ動いているか */
  alive: (pid: number) => boolean;
}

export const defaultProcessProbe: ProcessProbe = {
  lsof: lsofListening,
  ps: () => runCommand("/bin/ps", ["-A", "-o", "pid=,ppid=,etime=,command="], { timeout: 5_000 }),
  // 作業フォルダが読めないプロセス（ほかのユーザーのもの）があると終了コード 1 になる
  cwds: (pids) => runCommand(LSOF, ["-a", "-d", "cwd", "-p", pids.join(","), "-Fpn"], { okCodes: [1], timeout: 5_000 }),
  kill: (pid, signal) => process.kill(pid, signal),
  alive: (pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch (e) {
      // 権限がないだけ（EPERM）なら、まだ動いている
      return (e as NodeJS.ErrnoException).code === "EPERM";
    }
  },
};

/** 止めてから終わるのを待つ時間（過ぎても残っていれば、画面が「強制終了」を出す） */
const STOP_WAIT_MS = 5_000;
const STOP_POLL_MS = 200;

interface Options {
  store: Store;
  probe?: ProcessProbe;
  /** 自分（Kickoff）の pid。自分と祖先は一覧に出さず、止めさせない */
  selfPid?: number;
  /** 自分の .app の束（末尾の / まで。この中の実行ファイルの子孫 = Helper も一覧に出さない。.app でなければ null） */
  selfBundle?: string | null;
  /** 止めたあとに待つ時間（テストで縮める） */
  stopWaitMs?: number;
}

export class PortProcessService {
  probe: ProcessProbe;
  private readonly store: Store;
  private readonly selfPid: number;
  private readonly selfBundle: string | null;
  private readonly stopWaitMs: number;

  constructor({ store, probe = defaultProcessProbe, selfPid = process.pid, selfBundle = appBundleOf(process.execPath), stopWaitMs = STOP_WAIT_MS }: Options) {
    this.store = store;
    this.probe = probe;
    this.selfPid = selfPid;
    this.selfBundle = selfBundle;
    this.stopWaitMs = stopWaitMs;
  }

  /** 調べる（lsof が使えなければ空。プロジェクトのフォルダの外・Kickoff 自身（メイン・Helper）とその祖先は出さない） */
  async list(): Promise<PortProcess[]> {
    const sockets = await this.probe.lsof().then(parseLsof, () => []);
    const portsByPid = new Map<number, Set<number>>();
    for (const s of sockets) portsByPid.set(s.pid, (portsByPid.get(s.pid) ?? new Set()).add(s.port));
    if (portsByPid.size === 0) return [];
    const table = await this.probe.ps().then(parsePs, () => new Map());
    const self = new Set([...selfAndAncestors(this.selfPid, table), ...selfHelpers(this.selfPid, this.selfBundle, table)]);
    const pids = [...portsByPid.keys()].filter((pid) => !self.has(pid));
    if (pids.length === 0) return [];
    const [cwds, places] = await Promise.all([this.probe.cwds(pids).then(parseCwds, () => new Map<number, string>()), this.workplaces()]);
    const owners = this.bandOwners(places);
    const out: PortProcess[] = [];
    for (const pid of pids) {
      const cwd = cwds.get(pid);
      const place = cwd ? workplaceOf(cwd, places) : undefined;
      if (!place) continue;
      const row = table.get(pid);
      const ports = [...(portsByPid.get(pid) ?? [])].sort((a, b) => a - b);
      const full = row?.command ?? sockets.find((s) => s.pid === pid)?.process ?? "";
      const { origin, app } = originOf(pid, this.selfPid, table);
      out.push({
        pid,
        ports,
        command: shortCommand(full),
        command_full: full,
        project_id: place.project_id,
        worktree_path: place.worktree_path,
        branch: place.branch,
        uptime_seconds: row?.elapsed ?? null,
        origin,
        origin_app: app,
        bands: bandNotes(ports, owners, place.worktree_path),
      });
    }
    return out.sort((a, b) => a.project_id - b.project_id || a.ports[0] - b.ports[0]);
  }

  /**
   * 止める（いまの一覧にあり、コマンドが一覧のときと同じものだけ。pid の使い回しで別のものを止めないため）。
   * SIGTERM を送って少し待ち、終わったかを返す（終わらなければ画面が「強制終了」= force を出す）
   */
  async stop(pid: number, command: string, force = false): Promise<boolean> {
    const target = (await this.list()).find((p) => p.pid === pid);
    if (!target) throw new NotFound("そのプロセスは、もう動いていないか、プロジェクトのフォルダのプロセスではありません");
    if (target.command_full !== command) throw new Conflict("一覧を取ったあとで、別のプロセスに変わりました。一覧を取り直してください");
    this.probe.kill(pid, force ? "SIGKILL" : "SIGTERM");
    const until = Date.now() + this.stopWaitMs;
    while (this.probe.alive(pid)) {
      if (Date.now() >= until) return false;
      await new Promise((r) => setTimeout(r, STOP_POLL_MS));
    }
    return true;
  }

  /** プロジェクトの作業場所（本体とワークツリー。アーカイブしたプロジェクトは除く。Git でなければ本体だけ） */
  private async workplaces(): Promise<Workplace[]> {
    const projects = this.store.projects.list().filter((p) => p.archived_at === null);
    const lists = await Promise.all(
      projects.map(async (p): Promise<Workplace[]> => {
        const worktrees = await listWorktrees(p.repo_path).catch(() => null);
        if (!worktrees?.length) return [{ project_id: p.id, path: realPathLoose(p.repo_path), worktree_path: null, branch: null }];
        return worktrees.filter((w) => !w.prunable).map((w) => ({ project_id: p.id, path: realPathLoose(w.path), worktree_path: w.main ? null : w.path, branch: w.branch }));
      }),
    );
    return lists.flat();
  }

  /** 帯を持っているワークツリー（全プロジェクト。名前は作業場所のブランチ、なければフォルダ名） */
  private bandOwners(places: readonly Workplace[]): BandOwner[] {
    const branchOf = new Map(places.filter((p) => p.worktree_path !== null).map((p) => [p.worktree_path, p.branch]));
    return this.store.worktreeEnvs
      .list()
      .filter((e) => e.band !== null)
      .map((e) => ({ worktree_path: e.path, band: e.band as number, slots: e.slots, label: branchOf.get(e.path) ?? path.basename(e.path) }));
  }
}
