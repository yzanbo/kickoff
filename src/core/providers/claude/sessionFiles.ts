// Claude Code の会話記録のファイル（<設定のフォルダ>/projects/<作業フォルダの名前>/<セッション ID>.jsonl）を扱う:
// 探す・分岐する位置の手前の直近の区切り（圧縮の印から次の印まで）だけを切り出す・チャットを消したらゴミ箱へ移す。
// Claude Code は圧縮しても古いやり取りを消さずに書き足し続けるので、長く続けたチャットの記録は 1GB を超える
import { randomUUID } from "node:crypto";
import { open, readdir, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/** Claude Code が会話記録を置くフォルダ（CLAUDE_CONFIG_DIR があればその中） */
export const claudeProjectsDir = (env: NodeJS.ProcessEnv = process.env): string => join(env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "projects");

/** 分岐するとき写す区切りの数（最後の圧縮の要約と、その直前の区切りに残されたやり取りまで入るよう 2 つ） */
export const FORK_KEEP_SEGMENTS = 2;

/** 作業フォルダから、記録を置くフォルダの名前（英数字以外を - に。長いものは Claude Code がハッシュを付けるので、見つからなければ全体を探す） */
const projectDirName = (cwd: string) => cwd.replace(/[^a-zA-Z0-9]/g, "-");

const exists = (path: string) => stat(path).then(
  (s) => s.isFile(),
  () => false,
);

/** セッションの記録のファイルを探す（作業フォルダから決まる場所 → すべてのプロジェクトのフォルダ。なければ null） */
export async function findSessionFile(sessionId: string, cwds: string[], root = claudeProjectsDir()): Promise<string | null> {
  for (const cwd of cwds) {
    const guess = join(root, projectDirName(cwd), `${sessionId}.jsonl`);
    if (await exists(guess)) return guess;
  }
  const dirs = await readdir(root).catch(() => [] as string[]);
  for (const dir of dirs) {
    const path = join(root, dir, `${sessionId}.jsonl`);
    if (await exists(path)) return path;
  }
  return null;
}

/** ファイルを後ろから 1 行ずつ読む（行の中身と、その行の始まりの位置。大きいファイルでも全部をメモリに持たない） */
async function* linesBackward(path: string, chunkSize = 4 << 20): AsyncGenerator<{ line: string; offset: number }> {
  const fh = await open(path, "r");
  try {
    let pos = (await fh.stat()).size;
    let rest = Buffer.alloc(0);
    while (pos > 0) {
      const n = Math.min(chunkSize, pos);
      pos -= n;
      const chunk = Buffer.alloc(n);
      await fh.read(chunk, 0, n, pos);
      const data = Buffer.concat([chunk, rest]);
      let end = data.length;
      for (let i = data.length - 1; i >= 0; i--) {
        if (data[i] !== 0x0a) continue;
        if (end > i + 1) yield { line: data.toString("utf8", i + 1, end), offset: pos + i + 1 };
        end = i;
      }
      rest = data.subarray(0, end);
    }
    if (rest.length > 0) yield { line: rest.toString("utf8"), offset: 0 };
  } finally {
    await fh.close();
  }
}

const isBoundary = (line: string) => line.includes('"subtype":"compact_boundary"');

/**
 * 分岐する位置（messageId の行）より手前で、直近 keep 個の区切りが始まる位置と、分岐する位置の行の終わり。
 * 位置が見つからない・手前の圧縮の印が keep 個に足りない（それより前も Claude Code が読む会話）ときは null
 */
export async function recentSegmentsRange(path: string, messageId: string, keep = FORK_KEEP_SEGMENTS): Promise<{ start: number; end: number } | null> {
  const mark = `"uuid":"${messageId}"`;
  let end: number | null = null;
  let boundaries = 0;
  for await (const { line, offset } of linesBackward(path)) {
    if (end === null) {
      if (line.includes(mark)) end = offset + Buffer.byteLength(line) + 1;
      continue;
    }
    if (isBoundary(line) && ++boundaries === keep) return { start: offset, end };
  }
  return null;
}

/**
 * 分岐する位置の手前の直近の区切りだけを、別の ID の一時のセッションとして同じフォルダに書く（ID は記録の sessionId の欄だけ置き換える）。
 * 切り出せなければ null（呼ぶ側は丸ごと写す）。一時のセッションは、写したあとで呼ぶ側が消す
 */
export async function writeRecentSegments(path: string, sessionId: string, messageId: string, keep = FORK_KEEP_SEGMENTS): Promise<{ sessionId: string; path: string } | null> {
  const range = await recentSegmentsRange(path, messageId, keep);
  if (!range) return null;
  const fh = await open(path, "r");
  const buf = Buffer.alloc(range.end - range.start);
  try {
    await fh.read(buf, 0, buf.length, range.start);
  } finally {
    await fh.close();
  }
  const tmpId = randomUUID();
  const tmpPath = join(path, "..", `${tmpId}.jsonl`);
  await writeFile(tmpPath, buf.toString("utf8").split(`"sessionId":"${sessionId}"`).join(`"sessionId":"${tmpId}"`), { flag: "wx", mode: 0o600 });
  return { sessionId: tmpId, path: tmpPath };
}

/** 一時のセッションを消す（記録と、Claude Code が作ることのある同じ名前のフォルダ） */
export async function removeSession(path: string): Promise<void> {
  await rm(path, { force: true });
  await rm(path.replace(/\.jsonl$/, ""), { recursive: true, force: true });
}

/** セッションの記録（と、サブエージェントの記録などを置く同じ名前のフォルダ）をゴミ箱へ移す。移した記録の数を返す */
export async function trashSessions(sessionIds: string[], cwds: string[], trash: (path: string) => Promise<void>, root = claudeProjectsDir()): Promise<number> {
  let moved = 0;
  for (const id of sessionIds) {
    const file = await findSessionFile(id, cwds, root);
    if (!file) continue;
    await trash(file);
    moved++;
    const dir = file.replace(/\.jsonl$/, "");
    if (await stat(dir).then((s) => s.isDirectory(), () => false)) await trash(dir);
  }
  return moved;
}

/**
 * セッションの記録のファイルの大きさの合計（アーカイブ済みのチャットの整理の見込み）。作業フォルダから決まる場所だけを見る
 * （すべてのプロジェクトのフォルダを探すと、件数が多いと遅いため。見つからないものは数えない）
 */
export async function sessionFilesSize(sessionIds: string[], cwds: string[], root = claudeProjectsDir()): Promise<number> {
  let total = 0;
  for (const id of new Set(sessionIds)) {
    for (const cwd of cwds) {
      const size = await stat(join(root, projectDirName(cwd), `${id}.jsonl`)).then(
        (s) => (s.isFile() ? s.size : null),
        () => null,
      );
      if (size === null) continue;
      total += size;
      break;
    }
  }
  return total;
}
