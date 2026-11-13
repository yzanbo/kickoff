// ポートを使っているプロセスの純粋な関数: ps・lsof の作業フォルダの読み取り、起動元、コマンドの短縮、作業場所への振り分け、帯の添え書き
import path from "node:path";
import { WORKTREE_BAND_FIRST, WORKTREE_BAND_LAST, WORKTREE_BAND_SIZE, type PortBandNote, type PortOrigin, type WorktreePortSlot } from "@shared/types";

/** ps の 1 行（`ps -A -o pid=,ppid=,etime=,command=`） */
export interface PsRow {
  pid: number;
  ppid: number;
  /** 動いている時間（秒。読めなければ null） */
  elapsed: number | null;
  command: string;
}

/** ps の etime（[[日-]時:]分:秒）を秒にする（読めなければ null） */
export function parseEtime(etime: string): number | null {
  const m = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/.exec(etime.trim());
  if (!m) return null;
  const [, d, h, min, s] = m;
  return Number(d ?? 0) * 86_400 + Number(h ?? 0) * 3_600 + Number(min) * 60 + Number(s);
}

/** `ps -A -o pid=,ppid=,etime=,command=` の出力を pid → 行 にする（読めない行は飛ばす） */
export function parsePs(out: string): Map<number, PsRow> {
  const rows = new Map<number, PsRow>();
  for (const line of out.split("\n")) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/.exec(line);
    if (!m) continue;
    const pid = Number(m[1]);
    // ps はコマンドの中の改行を \012 と書く（python -c の複数行など）。1 行に読み替える
    rows.set(pid, { pid, ppid: Number(m[2]), elapsed: parseEtime(m[3]), command: m[4].replace(/\\012/g, " ").replace(/\s+/g, " ").trim() });
  }
  return rows;
}

/** `lsof -a -d cwd -p <pid,…> -Fpn` の出力を pid → 作業フォルダ にする（p の行で pid、続く n の行でフォルダ） */
export function parseCwds(out: string): Map<number, string> {
  const cwds = new Map<number, string>();
  let pid: number | null = null;
  for (const line of out.split("\n")) {
    if (line.startsWith("p")) pid = Number(line.slice(1));
    else if (line.startsWith("n") && pid !== null && Number.isInteger(pid)) cwds.set(pid, line.slice(1));
  }
  return cwds;
}

/** 自分（Kickoff）とその祖先の pid（一覧に出さず、止めさせない。製品版の中で開発版が動いているときの製品版も祖先） */
export function selfAndAncestors(self: number, table: ReadonlyMap<number, PsRow>): Set<number> {
  const out = new Set<number>();
  let pid: number | undefined = self;
  while (pid !== undefined && pid > 1 && !out.has(pid)) {
    out.add(pid);
    pid = table.get(pid)?.ppid;
  }
  return out;
}

/** 実行ファイルのパスから .app の束のフォルダ（末尾の / まで。/A/Kickoff.app/Contents/MacOS/Kickoff → /A/Kickoff.app/。.app でなければ null） */
export function appBundleOf(execPath: string): string | null {
  const i = execPath.indexOf(".app/");
  return i < 0 ? null : execPath.slice(0, i + ".app/".length);
}

/**
 * 自分（Kickoff）の Helper（子孫のうち、自分の .app の束の中の実行ファイルのもの。描画・GPU・ネットワークなど）。
 * ターミナルのシェルとそこから起動したもの（束の外）は入れない（「Kickoff の中」として出す）
 */
export function selfHelpers(self: number, bundle: string | null, table: ReadonlyMap<number, PsRow>): Set<number> {
  const out = new Set<number>();
  if (!bundle) return out;
  for (const row of table.values()) {
    if (!row.command.startsWith(bundle)) continue;
    // 親をたどって自分に着けば子孫
    const seen = new Set<number>();
    let cur: PsRow | undefined = table.get(row.ppid);
    while (cur && !seen.has(cur.pid)) {
      if (cur.pid === self) {
        out.add(row.pid);
        break;
      }
      seen.add(cur.pid);
      cur = table.get(cur.ppid);
    }
  }
  return out;
}

/** .app の名前（/Applications/Visual Studio Code.app/Contents/… → Visual Studio Code。なければ null） */
const appNameOf = (command: string) => /(?:^|\/)([^/]+)\.app\//.exec(command)?.[1] ?? null;

/**
 * 起動元: 祖先に Kickoff（self）があれば「Kickoff の中」、親が launchd（pid 1）なら「切り離されている」（起動したものが終わって残ったもの）、
 * ほかは「ほかのアプリ」（launchd のすぐ下の祖先の .app の名前を添える）
 */
export function originOf(pid: number, self: number, table: ReadonlyMap<number, PsRow>): { origin: PortOrigin; app: string | null } {
  const row = table.get(pid);
  if (!row) return { origin: "other", app: null };
  if (row.ppid === 1) return { origin: "detached", app: null };
  const seen = new Set<number>([pid]);
  let top: PsRow = row;
  let cur: PsRow | undefined = table.get(row.ppid);
  while (cur && !seen.has(cur.pid)) {
    if (cur.pid === self) return { origin: "kickoff", app: null };
    seen.add(cur.pid);
    top = cur;
    if (cur.ppid <= 1) break;
    cur = table.get(cur.ppid);
  }
  return { origin: "other", app: appNameOf(top.command) };
}

/** スクリプトを動かす実行ファイル（2 つ目の語がスクリプトの名前になる） */
const INTERPRETER = /^(node|bun|deno|tsx|ts-node|python[\d.]*|ruby|php)$/i;
/** スクリプトの名前がこれなら、node_modules の中のパッケージ名を名前にする（tsx の dist/cli.mjs など） */
const GENERIC = new Set(["cli", "index", "main", "bin", "server", "start", "run"]);
/** 名前に続けて出してよい語（dev・serve などのサブコマンド。パス・オプション・長いものは出さない） */
const isWord = (s: string | undefined): s is string => s !== undefined && /^[a-z][\w:-]{0,19}$/i.test(s);

/** node_modules の中のパッケージ名（…/node_modules/@scope/name/… → @scope/name。.bin は除く） */
function packageOf(script: string): string | null {
  const parts = script.split("/");
  const i = parts.lastIndexOf("node_modules");
  if (i < 0 || i + 1 >= parts.length || parts[i + 1] === ".bin") return null;
  return parts[i + 1].startsWith("@") && parts[i + 2] ? `${parts[i + 1]}/${parts[i + 2]}` : parts[i + 1];
}

/** コマンドを短くする（node …/node_modules/.bin/vite → vite、node …/next/dist/bin/next dev → next dev、python3 -m http.server 8000 → python3 -m http.server） */
export function shortCommand(full: string): string {
  const words = full.trim().split(/\s+/);
  const base0 = path.basename(words[0] ?? "");
  if (!INTERPRETER.test(base0)) return isWord(words[1]) ? `${base0} ${words[1]}` : base0;
  // Homebrew の Python.app の Python なども、名前は小文字でそろえる
  const exe = base0.toLowerCase();
  let i = 1;
  while (i < words.length && words[i].startsWith("-")) {
    if (words[i] === "-m" && words[i + 1]) return `${exe} -m ${words[i + 1]}`;
    // その場で書いたコード（python -c・node -e）は、コードを出さない
    if (words[i] === "-c" || words[i] === "-e") return `${exe} ${words[i]}`;
    i++;
  }
  const script = words[i];
  if (!script) return exe;
  const base = path.basename(script).replace(/\.(m|c)?[jt]s$/, "");
  const name = GENERIC.has(base) ? (packageOf(script) ?? base) : base;
  return isWord(words[i + 1]) ? `${name} ${words[i + 1]}` : name;
}

/** プロジェクトの作業場所 1 つ（本体かワークツリー。path は実体のパス） */
export interface Workplace {
  project_id: number;
  path: string;
  /** null は本体 */
  worktree_path: string | null;
  branch: string | null;
}

/** 作業フォルダがいちばん深く入る作業場所（どれにも入らなければ undefined） */
export function workplaceOf(cwd: string, places: readonly Workplace[]): Workplace | undefined {
  let best: Workplace | undefined;
  for (const p of places) {
    const inside = cwd === p.path || cwd.startsWith(p.path.endsWith("/") ? p.path : `${p.path}/`);
    if (inside && (!best || p.path.length > best.path.length)) best = p;
  }
  return best;
}

/** 帯を持っているワークツリー（帯の先頭・対応表・名前） */
export interface BandOwner {
  worktree_path: string;
  band: number;
  slots: readonly WorktreePortSlot[];
  label: string;
}

/**
 * 帯の番号の添え書き（帯の中の番号だけ）。own はプロセスの作業場所のワークツリー（本体なら null）で、帯の持ち主と違えば mismatch
 */
export function bandNotes(ports: readonly number[], owners: readonly BandOwner[], own: string | null): PortBandNote[] {
  const notes: PortBandNote[] = [];
  for (const port of ports) {
    if (port < WORKTREE_BAND_FIRST || port >= WORKTREE_BAND_LAST + WORKTREE_BAND_SIZE) continue;
    const owner = owners.find((o) => port >= o.band && port < o.band + WORKTREE_BAND_SIZE);
    if (!owner) continue;
    const slot = port === owner.band ? "開発サーバー" : (owner.slots.find((s) => s.port === port)?.service ?? null);
    notes.push({ port, worktree_path: owner.worktree_path, label: owner.label, slot, mismatch: owner.worktree_path !== own });
  }
  return notes;
}
