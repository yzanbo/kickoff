// 作業場所の変更（git status の読み方。参照・ブランチ・remote は reads.ts）。git の機能の状態と、AI の切り替えの資料が同じ読み方を使う
import { timed } from "@/foundation/core/system/stallWatch";
import { git } from "./git";
import { gitPrefix } from "./reads";

/** 変更の種類（M: 変更 / A: 追加 / D: 削除 / R: 名前の変更 / C: コピー / T: 種類の変更 / U: 未追跡 / !: 競合。@shared/git の GitChangeKind と同じ） */
export type ChangeKind = "M" | "A" | "D" | "R" | "C" | "T" | "U" | "!";
/** 1 つのファイルの変更（path はリポジトリの中のパス。old_path は名前を変えたときの元のパス） */
export interface FileChange {
  path: string;
  old_path?: string;
  kind: ChangeKind;
}
/** 作業場所の変更（ブランチ・追いかけている先との進み遅れ・ステージ済み・未ステージ（未追跡も）・競合） */
export interface WorkplaceStatus {
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  staged: FileChange[];
  unstaged: FileChange[];
  conflicts: FileChange[];
}

const KINDS = new Set<ChangeKind>(["M", "A", "D", "R", "C", "T"]);
export const kindOf = (code: string): ChangeKind => (KINDS.has(code as ChangeKind) ? (code as ChangeKind) : "M");
/** 競合している状態（両方で変更・片方で削除など） */
const CONFLICTS = new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"]);

/** 追いかけているブランチとの進み・遅れ（「[ahead 1, behind 2]」の形。git status の見出し・for-each-ref の upstream:track で同じ） */
export function parseAheadBehind(text: string): { ahead: number; behind: number } {
  return { ahead: Number(/ahead (\d+)/.exec(text)?.[1] ?? 0), behind: Number(/behind (\d+)/.exec(text)?.[1] ?? 0) };
}

/** `## main...origin/main [ahead 1, behind 2]` からブランチと進み・遅れを読む */
function parseBranch(line: string): { branch: string | null; upstream: string | null; ahead: number; behind: number } {
  const text = line.replace(/^## /, "");
  const { ahead, behind } = parseAheadBehind(text);
  // コミットがまだないとき: "No commits yet on main"
  const initial = /^No commits yet on (.+)$/.exec(text);
  if (initial) return { branch: initial[1], upstream: null, ahead, behind };
  if (text.startsWith("HEAD (no branch)")) return { branch: null, upstream: null, ahead, behind };
  const upstream = /\.\.\.(\S+)/.exec(text)?.[1] ?? null;
  return { branch: text.split(/\.\.\.| /)[0] || null, upstream, ahead, behind };
}

/** `git status --porcelain=v1 -z --branch` の出力を読む */
export function parseGitStatus(raw: string): WorkplaceStatus {
  const records = raw.split("\0");
  const status: WorkplaceStatus = { branch: null, upstream: null, ahead: 0, behind: 0, staged: [], unstaged: [], conflicts: [] };
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (!record) continue;
    if (record.startsWith("## ")) {
      Object.assign(status, parseBranch(record));
      continue;
    }
    const code = record.slice(0, 2);
    const file = record.slice(3);
    const [x, y] = code;
    // 名前の変更・コピーは、次の区切りに元のパスが入る
    const oldPath = x === "R" || x === "C" || y === "R" || y === "C" ? records[++i] : undefined;
    const change = (kind: ChangeKind): FileChange => (oldPath ? { path: file, old_path: oldPath, kind } : { path: file, kind });
    if (code === "??") status.unstaged.push(change("U"));
    else if (CONFLICTS.has(code)) status.conflicts.push(change("!"));
    else {
      if (x !== " ") status.staged.push(change(kindOf(x)));
      if (y !== " ") status.unstaged.push(change(kindOf(y)));
    }
  }
  return status;
}

/** git status の変更を、リポジトリの中のフォルダ（prefix）の中だけにし、パスをそのフォルダから見た形にする（外から名前を変えたものは、足したものにする） */
export function scopeChanges(changes: FileChange[], prefix: string): FileChange[] {
  if (!prefix) return changes;
  const head = `${prefix}/`;
  const out: FileChange[] = [];
  for (const change of changes) {
    if (!change.path.startsWith(head)) continue;
    const path = change.path.slice(head.length);
    if (change.old_path === undefined) out.push({ ...change, path });
    else if (change.old_path.startsWith(head)) out.push({ ...change, path, old_path: change.old_path.slice(head.length) });
    else out.push({ path, kind: change.kind === "!" ? "!" : "A" });
  }
  return out;
}

/** git status の出力を読む（変更の多い作業場所では数万行。同期の処理なので詰まりの見張りに名前を付ける。system/stallWatch.ts） */
const readRaw = timed("git:status", (raw: string) => parseGitStatus(raw));

/** リポジトリの中のフォルダ prefix（gitPrefix の値）の変更（その中だけ。パスはそのフォルダから見た形） */
export async function statusIn(dir: string, prefix: string): Promise<WorkplaceStatus> {
  const status = readRaw(await git(dir).run(["status", "--porcelain=v1", "-z", "--branch", "--untracked-files=all", ...(prefix ? ["--", "."] : [])]));
  return { ...status, staged: scopeChanges(status.staged, prefix), unstaged: scopeChanges(status.unstaged, prefix), conflicts: scopeChanges(status.conflicts, prefix) };
}

/** 作業場所の変更（Git で管理されていなければ null） */
export async function workplaceStatus(dir: string): Promise<WorkplaceStatus | null> {
  const prefix = await gitPrefix(dir);
  return prefix === null ? null : statusIn(dir, prefix);
}
