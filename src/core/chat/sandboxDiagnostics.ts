// 実行ごとの短い診断。明示的に始めた間だけ親子を調べ、両端を観測できた時間の拒否だけを返す
import type { DiagnosticProcess, SandboxDenial, SandboxDiagnosticsPlatform, SandboxLogFailure } from "../platform/sandboxDiagnostics.js";

const CAPTURE_MS = 120_000;
const PROCESS_LIMIT = 256;
const ENTRY_LIMIT = 100;
const LIMITATION = "診断開始後、この実行の子プロセスと確認できた期間だけが対象です。短命なプロセス・開始前・OS が保存しない記録は取れません。該当なしでも拒否がなかったとは断定できません。パスと未知のサービス名は非表示です。";
type Interval = { pid: number; first: number; last: number };
type Capture = {
  start: number;
  end: number | null;
  active: Map<string, Interval>;
  intervals: Interval[];
  controller: AbortController;
  pending: Promise<void> | null;
  timer: ReturnType<typeof setTimeout> | null;
  deadline: ReturnType<typeof setTimeout> | null;
  failed: boolean;
  limited: boolean;
  entries: SandboxDenial[];
  stopLog: (() => Promise<void>) | null;
  logFailed: SandboxLogFailure | null;
};

/** MCP に出すのは引数のない 2 つの操作だけ。PID・期間・predicate は渡せない */
export interface AiSandboxDiagnostics {
  start(): Promise<string>;
  read(): Promise<string>;
}

export class TurnSandboxDiagnostics implements AiSandboxDiagnostics {
  private readonly roots = new Map<number, number>();
  private capture: Capture | null = null;
  private closed = false;
  private reading = false;
  private starting = false;

  constructor(private readonly platform: SandboxDiagnosticsPlatform, private readonly now: () => number = Date.now) {}

  /** プロバイダーが自分で起動した CLI の PID だけ。AI の引数から登録しない */
  readonly onSpawn = (pid: number): void => {
    if (!this.closed && Number.isSafeInteger(pid) && pid > 0) this.roots.set(pid, this.now());
  };

  async start(): Promise<string> {
    if (this.closed || this.reading || this.starting) return this.result("unavailable", "診断を開始できません");
    this.starting = true;
    try { return await this.startCapture(); } finally { this.starting = false; }
  }

  private async startCapture(): Promise<string> {
    this.disposeCapture();
    if (!this.roots.size) return this.result("unavailable", "この AI の実行プロセスを確認できません");
    const c: Capture = { start: this.now(), end: null, active: new Map(), intervals: [], controller: new AbortController(), pending: null, timer: null, deadline: null, failed: false, limited: false, entries: [], stopLog: null, logFailed: null };
    this.capture = c;
    await this.sample(c);
    if (this.closed || c.failed || !c.active.size) {
      this.disposeCapture();
      return this.result("unavailable", "実行プロセスの親子関係を取得できません");
    }
    try {
      c.stopLog = await this.platform.watch?.(c.controller.signal, (entry) => {
        // 他チャットの記録を保持しない。後から時刻も観測済みの区間で絞る
        if (!c.active.size || !Array.from(c.active.values()).some((i) => i.pid === entry.pid)) return;
        if (c.entries.length < 1000) c.entries.push(entry);
        else c.limited = true;
      }, (reason) => { c.logFailed = reason; }) ?? null;
    } catch { c.logFailed ??= "spawn_failed"; }
    if (this.closed || c.logFailed) {
      this.disposeCapture();
      return this.result("unavailable", `OS の拒否ログの収集を開始できません（${c.logFailed ?? "cancelled"}）。権限・OS 設定は変更していません`);
    }
    c.deadline = setTimeout(() => { this.stop(c); void c.stopLog?.(); }, Math.max(0, CAPTURE_MS - (this.now() - c.start)));
    c.deadline.unref?.();
    this.schedule(c);
    return this.result("capturing", "2 分以内にエラーを再現し、read_sandbox_denials で読み取ってください。読み取ると収集は終了します");
  }

  async read(): Promise<string> {
    const c = this.capture;
    if (this.closed || this.reading || this.starting || !c) return this.result("unavailable", "先に start_sandbox_diagnostics で診断を開始してください");
    this.reading = true;
    try {
      const expired = c.end !== null;
      this.stop(c);
      await c.pending;
      if (!expired && !c.failed) await this.sample(c);
      await c.stopLog?.();
      if (c.logFailed && c.logFailed !== "output_limit") return this.result("unavailable", `OS の拒否ログの収集中に失敗しました（${c.logFailed}）。該当なしとは判断できません`);
      if (c.failed || this.closed) return this.result("unavailable", "プロセスの追跡に失敗しました。OS ログは返しません");
      const end = Math.min(c.end!, c.start + CAPTURE_MS);
      let entries: SandboxDenial[];
      try {
        entries = c.stopLog ? c.entries : await this.platform.denials(c.start, end, c.controller.signal);
      } catch {
        return this.result("unavailable", "OS の拒否ログを読み取れません（権限・OS の制約・時間切れ・形式の違いなど）。権限や OS 設定は変更していません");
      }
      if (this.closed) return this.result("unavailable", "実行が終了しました");
      const ours = entries.filter((e) => e.timestamp >= c.start && e.timestamp <= end && c.intervals.some((i) => i.pid === e.pid && e.timestamp >= i.first && e.timestamp <= i.last));
      if (c.logFailed === "output_limit" && !ours.length) return this.result("unavailable", "OS ログが出力上限に達しました（output_limit）。該当なしとは判断できません");
      return JSON.stringify({ status: ours.length ? "ok" : "no_matching_entries", entries: ours.slice(0, ENTRY_LIMIT).map((e) => ({ ...e, timestamp: new Date(e.timestamp).toISOString() })), limited: c.limited || ours.length > ENTRY_LIMIT || c.logFailed === "output_limit", expired, limitation: LIMITATION });
    } finally {
      this.reading = false;
      this.disposeCapture();
    }
  }

  close(): void {
    this.closed = true;
    this.disposeCapture();
    this.roots.clear();
  }

  private result(status: string, reason: string): string {
    return JSON.stringify({ status, reason, limitation: LIMITATION });
  }

  private schedule(c: Capture): void {
    if (this.closed || c.end !== null || c.failed) return;
    c.timer = setTimeout(() => {
      c.pending = this.sample(c).finally(() => { c.pending = null; this.schedule(c); });
    }, 250);
    c.timer.unref?.();
  }

  private async sample(c: Capture): Promise<void> {
    const before = this.now();
    try {
      const rows = await this.platform.processes(c.controller.signal);
      if (c.controller.signal.aborted) return;
      const byPid = new Map(rows.map((p) => [p.pid, p]));
      const belongs = (p: DiagnosticProcess): boolean => {
        const seen = new Set<number>();
        let current: DiagnosticProcess | undefined = p;
        while (current && !seen.has(current.pid)) {
          seen.add(current.pid);
          const spawned = this.roots.get(current.pid);
          // ps の時刻は秒単位。起動通知と合わないものは PID の使い回しとみなし捨てる
          if (spawned !== undefined) return current.startedAt <= spawned && current.startedAt > spawned - 2000;
          current = byPid.get(current.ppid);
        }
        return false;
      };
      const active = new Map<string, Interval>();
      for (const p of rows) {
        if (!belongs(p)) continue;
        if (active.size >= PROCESS_LIMIT || c.intervals.length >= 1024) { c.limited = true; break; }
        const key = `${p.pid}:${p.ppid}:${p.startedAt}`;
        const prior = c.active.get(key);
        // 初回は取得の後、継続時の終端は取得の前。取得中の不確かな時間を広げない
        const observed = this.now();
        const interval = prior ?? { pid: p.pid, first: observed, last: observed - 1 };
        if (prior) interval.last = before;
        else c.intervals.push(interval);
        active.set(key, interval);
      }
      c.active = active;
    } catch {
      c.failed = true;
      this.stop(c);
    }
  }

  private stop(c: Capture): void {
    c.end ??= Math.min(this.now(), c.start + CAPTURE_MS);
    if (c.timer) clearTimeout(c.timer);
    if (c.deadline) clearTimeout(c.deadline);
    c.timer = c.deadline = null;
  }

  private disposeCapture(): void {
    if (!this.capture) return;
    this.stop(this.capture);
    void this.capture.stopLog?.();
    this.capture.controller.abort();
    this.capture = null;
  }
}
