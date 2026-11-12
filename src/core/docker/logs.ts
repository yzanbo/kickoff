// Docker タブのログの画面の流れ: compose のコンテナごとの docker logs（時刻付き）を 1 本の SSE にまとめる。
// 開いたときは最新の 500 行、動いているものは流れ続け、止まった・起動し直した・作り直されたら区切りを知らせる。ログは保存しない
import type { DockerLogEvent, DockerLogLine, DockerLogSource } from "@shared/types";
import { errorMessage } from "@shared/errors";
import type { StreamedCommand } from "../system/stream.js";
import type { DockerCli } from "./cli.js";
import { parseLogLine } from "./parse.js";

/** 開いたとき・さかのぼるときに読む行数（コンテナごと） */
export const DOCKER_LOG_TAIL = 500;
/** 行をまとめて送る間隔 */
const FLUSH_MS = 100;

/** ts より後の行だけ（--since は同じ時刻の行も返すので、受け取った最後の行までを落とす） */
const after = (lines: DockerLogLine[], ts: string | undefined) => (ts ? lines.filter((l) => !l.ts || l.ts > ts) : lines);

/**
 * ログの画面 1 つ分の流れ。sources でいまの compose のコンテナを引き、変わったら sync を呼んでもらう（docker_changed・追っていたものが終わったとき）。
 * 止めたら（画面を閉じた）、流しているものをすべて止める
 */
export class DockerLogSession {
  private readonly followers = new Map<string, StreamedCommand>();
  private readonly known = new Map<string, DockerLogSource>();
  /** コンテナごとの受け取った最後の時刻（つなぎ直すときの --since と、重なった行を落とすのに使う） */
  private readonly lastTs = new Map<string, string>();
  private readonly pending = new Map<string, DockerLogLine[]>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private chain: Promise<void> = Promise.resolve();
  private closed = false;

  constructor(
    private readonly cli: DockerCli,
    private readonly sources: () => Promise<DockerLogSource[]>,
    private readonly send: (event: DockerLogEvent) => void,
  ) {}

  /** いまのコンテナにそろえる（重なった頼みは順に 1 つずつ） */
  sync(): Promise<void> {
    this.chain = this.chain.then(() => this.syncNow()).catch((e) => this.send({ type: "error", message: errorMessage(e) }));
    return this.chain;
  }

  private async syncNow() {
    if (this.closed) return;
    const sources = await this.sources();
    if (this.closed) return;
    this.send({ type: "sources", sources });
    const now = new Date().toISOString();
    for (const s of sources) {
      const prev = this.known.get(s.container);
      this.known.set(s.container, s);
      if (s.running && !this.followers.has(s.container)) {
        // 止まっていたものが起動し直した（同じコンテナ）なら区切りを入れて続きから。新しいコンテナ（作り直し・数を増やした）は最新の 500 行から
        if (prev && !prev.running) this.send({ type: "started", container: s.container, at: now });
        this.follow(s.container);
      } else if (!s.running && prev?.running) {
        this.flush();
        this.send({ type: "stopped", container: s.container, at: now, exit_code: s.exit_code });
      } else if (!s.running && !prev) {
        await this.readStopped(s.container);
      }
    }
  }

  /** 止まっているコンテナの最後の 500 行（1 回だけ読む） */
  private async readStopped(container: string) {
    this.push(container, await readLog(this.cli, ["--tail", String(DOCKER_LOG_TAIL), container]));
  }

  /** 動いているコンテナを追う（終わったら一覧を取り直して、止まった区切りを知らせる） */
  private follow(container: string) {
    const since = this.lastTs.get(container);
    const args = ["logs", "-f", "--timestamps", ...(since ? ["--since", since] : ["--tail", String(DOCKER_LOG_TAIL)]), container];
    // 続きから読み直すときは、前に受け取った最後の時刻までを落とす（標準出力と標準エラーは届く順と時刻の順がずれるので、そのときの時刻で比べる）
    const onLine = (raw: string) => this.push(container, after([parseLogLine(raw)], since));
    const stream = this.cli.stream(args, { onLine, onErrorLine: onLine });
    if (!stream) return;
    this.followers.set(container, stream);
    void stream.done.then(() => {
      if (this.followers.get(container) === stream) this.followers.delete(container);
      if (!this.closed) void this.sync();
    });
  }

  private push(container: string, lines: DockerLogLine[]) {
    if (!lines.length || this.closed) return;
    const last = lines.reduce((max, l) => (l.ts > max ? l.ts : max), this.lastTs.get(container) ?? "");
    if (last) this.lastTs.set(container, last);
    this.pending.set(container, [...(this.pending.get(container) ?? []), ...lines]);
    this.flushTimer ??= setTimeout(() => this.flush(), FLUSH_MS);
  }

  private flush() {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    for (const [container, lines] of this.pending) this.send({ type: "lines", container, lines });
    this.pending.clear();
  }

  close() {
    this.closed = true;
    if (this.flushTimer) clearTimeout(this.flushTimer);
    for (const s of this.followers.values()) s.stop();
    this.followers.clear();
  }
}

/**
 * 1 回だけ読む docker logs（時刻付き）。コンテナの標準エラーは docker logs の標準エラーに出る（postgres などは普段のログも標準エラー）ので、
 * 両方を集めて時刻の順に並べる
 */
export async function readLog(cli: DockerCli, args: string[]): Promise<DockerLogLine[]> {
  const lines: DockerLogLine[] = [];
  const onLine = (raw: string) => lines.push(parseLogLine(raw));
  const stream = cli.stream(["logs", "--timestamps", ...args], { onLine, onErrorLine: onLine });
  if (!stream) return [];
  await stream.done;
  return sortLines(lines);
}

/** 時刻の順に並べる（同じ時刻・時刻のない行は受け取った順のまま） */
export function sortLines(lines: DockerLogLine[]): DockerLogLine[] {
  return lines.map((l, i) => ({ l, i })).sort((a, b) => (a.l.ts && b.l.ts && a.l.ts !== b.l.ts ? (a.l.ts < b.l.ts ? -1 : 1) : a.i - b.i)).map((x) => x.l);
}
