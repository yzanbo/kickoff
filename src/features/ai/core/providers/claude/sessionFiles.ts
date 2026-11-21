// Claude Code の会話記録のファイル（<設定のフォルダ>/projects/<作業フォルダの名前>/<セッション ID>.jsonl）を扱う:
// 探す・分岐する位置の手前の直近の区切り（圧縮の印から次の印まで）だけを切り出す・チャットを消したらゴミ箱へ移す。
// Claude Code は圧縮しても古いやり取りを消さずに書き足し続けるので、長く続けたチャットの記録は 1GB を超える
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { open, readdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";
import type { SessionFileInfo, SessionStore } from "@/features/ai/core/providers/types";
import { claudeProjectsDir, isBoundary, isFileHistoryLine, projectDirName, SESSION_FILE } from "./internals";

/**
 * 会話を写すとき残す区切り（圧縮の印から次の印まで）の数:
 * 同じ会話を続けるもの（分岐・巻き戻し・長いチャットの乗り換え）は 3（いまの区切りとその前の 2 つ。1 つ前の圧縮より前まで巻き戻せる）、
 * 子チャットは 1（最新の要約とそのあとのやり取りだけ。寄り道に使い、AI が読むのも最新の区切りだけのため。呼ぶ側が providers/types.ts の CHILD_FORK_KEEP を渡す）
 */
export const FORK_KEEP_SEGMENTS = 3;

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

/**
 * 後ろから数えて keep 個目の区切り（圧縮の印）が始まる位置。before があれば、その発言（uuid が before の行）より手前で数え、
 * その行の終わりも返す（その行より後ろの区切りは数えない）。行が見つからない・区切りが keep 個に足りなければ null
 */
export async function segmentStart(path: string, keep: number, before?: string): Promise<{ start: number; end?: number } | null> {
  const mark = before === undefined ? null : `"uuid":"${before}"`;
  let end: number | undefined;
  let boundaries = 0;
  for await (const { line, offset } of linesBackward(path)) {
    if (mark !== null && end === undefined) {
      if (line.includes(mark)) end = offset + Buffer.byteLength(line) + 1;
      continue;
    }
    if (isBoundary(line) && ++boundaries === keep) return end === undefined ? { start: offset } : { start: offset, end };
  }
  return null;
}

/**
 * 記録の一部（start から end の手前まで。end がなければ終わりまで）を、新しい ID のセッションとして同じフォルダに流して書く
 * （全部をメモリに持たない。ID は記録の sessionId の欄だけ置き換え、本文に出てくる ID は変えない）。
 * dropFileHistory: ファイルの控えの行（file-history-snapshot・file-history-delta）を写さない。
 * adoptSidecar: 同じ名前のフォルダ（サブエージェントの記録など）を新しいセッションの名前に移す（前のサブエージェントの会話を読めるように）
 */
export async function writeSlice(
  path: string,
  sessionId: string,
  slice: { start: number; end?: number },
  opts: { dropFileHistory?: boolean; adoptSidecar?: boolean } = {},
): Promise<{ sessionId: string; path: string }> {
  const newId = randomUUID();
  const newPath = join(path, "..", `${newId}.jsonl`);
  const out = createWriteStream(newPath, { flags: "wx", mode: 0o600 });
  try {
    // 読む範囲の end は終わりの位置を含むので 1 つ手前
    const input = createReadStream(path, { start: slice.start, ...(slice.end !== undefined ? { end: slice.end - 1 } : {}) });
    for await (const line of createInterface({ input, crlfDelay: Infinity })) {
      if (!line || (opts.dropFileHistory && isFileHistoryLine(line))) continue;
      if (!out.write(`${line.split(`"sessionId":"${sessionId}"`).join(`"sessionId":"${newId}"`)}\n`)) await once(out, "drain");
    }
  } finally {
    await new Promise<void>((resolve, reject) => out.end((e?: Error | null) => (e ? reject(e) : resolve())));
  }
  const oldDir = path.replace(/\.jsonl$/, "");
  if (opts.adoptSidecar && (await stat(oldDir).then((s) => s.isDirectory(), () => false))) await rename(oldDir, newPath.replace(/\.jsonl$/, "")).catch(() => {});
  return { sessionId: newId, path: newPath };
}

/**
 * 分岐する位置（messageId の行）の手前の直近 keep 個の区切りだけを、別の ID の一時のセッションとして同じフォルダに書く。
 * 切り出せなければ null（位置が見つからない・手前の区切りが足りない = それより前も Claude Code が読む会話。呼ぶ側は丸ごと写す）。
 * 一時のセッションは、写したあとで呼ぶ側が消す。切るのは SDK の forkSession で写す前の元（写したあとのファイルを切り詰めると、続きで Claude Code が会話を覚えていなかった）
 */
export async function writeRecentSegments(path: string, sessionId: string, messageId: string, keep = FORK_KEEP_SEGMENTS): Promise<{ sessionId: string; path: string } | null> {
  const range = await segmentStart(path, keep, messageId);
  return range?.end === undefined ? null : writeSlice(path, sessionId, range);
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

/**
 * 長く続けたセッションの記録を、終わりの直近 keep 個の区切り（圧縮の印から次の印まで）だけにした新しいセッションとして同じフォルダに書く
 * （圧縮した作業が終わったら乗り換える）。分岐（forkSession）と違い、発言の ID とファイルの控え（file-history-snapshot）を
 * そのまま残すので、残した区切りの中の発言へは巻き戻し・「ファイルを戻す」ができる。Claude Code は続きのセッションでは最後の印から後ろだけを読むので、
 * 会話の中身は変わらない。区切りが keep 個に足りない（切るものがない）ときは null
 */
export async function trimToRecentSegments(path: string, sessionId: string, keep = FORK_KEEP_SEGMENTS): Promise<{ sessionId: string; path: string; dropped: number } | null> {
  const segment = await segmentStart(path, keep);
  if (!segment || segment.start === 0) return null;
  return { ...(await writeSlice(path, sessionId, segment, { adoptSidecar: true })), dropped: segment.start };
}

/**
 * 作業場所を移すとき、会話を新しい ID のセッションに写して同じフォルダに書く。
 * 終わりの直近 keep 個の区切り（圧縮の印から次の印まで）があればそこから、足りなければ丸ごと写す（短い会話なので小さい）。発言の ID は保つ
 * （移したあとの起点 = 区切りの直前の作業の終わりのメッセージを、新しいセッションでも同じ ID で指せるように）。
 * ファイルの控えの行（file-history-snapshot・file-history-delta）は写さない: 控えは元の作業場所のファイルを指していて、残すと移したあとに
 * 同じ名前のファイルを書き換えた発言の「ファイルを戻す」が、戻したと答えるのに戻らない（分岐の forkSession も控えを写さない）。
 * 区切りより前の発言へは巻き戻せない決まりなので、控えは要らない。同じ名前のフォルダ（サブエージェントの記録など）は新しいセッションの名前に移す
 */
export async function copyForWorkplaceMove(path: string, sessionId: string, keep = FORK_KEEP_SEGMENTS): Promise<{ sessionId: string; path: string }> {
  return writeSlice(path, sessionId, (await segmentStart(path, keep)) ?? { start: 0 }, { dropFileHistory: true, adoptSidecar: true });
}

/** 頭だけ読む大きさ（最初の発言と作業フォルダを探す。大きなファイルを全部読まない） */
const HEAD_BYTES = 256 << 10;

/** 記録の頭から、作業フォルダと最初の自分の発言を読む（Kickoff・Claude Code が足す < で始まる知らせ・メタの行は飛ばす） */
export async function readSessionHead(path: string): Promise<{ cwd: string | null; firstPrompt: string | null }> {
  const fh = await open(path, "r");
  let text: string;
  try {
    const buf = Buffer.alloc(HEAD_BYTES);
    const { bytesRead } = await fh.read(buf, 0, HEAD_BYTES, 0);
    text = buf.toString("utf8", 0, bytesRead);
  } finally {
    await fh.close();
  }
  let cwd: string | null = null;
  let firstPrompt: string | null = null;
  // 最後の行は途中で切れているかもしれないので読まない
  for (const line of text.split("\n").slice(0, -1)) {
    let entry: { cwd?: unknown; type?: unknown; isMeta?: unknown; message?: { content?: unknown } };
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (!cwd && typeof entry.cwd === "string") cwd = entry.cwd;
    if (!firstPrompt && entry.type === "user" && !entry.isMeta) {
      const content = entry.message?.content;
      const textOf = typeof content === "string" ? content : Array.isArray(content) ? content.map((c: { type?: string; text?: string }) => (c.type === "text" ? (c.text ?? "") : "")).join("") : "";
      const trimmed = textOf.trim();
      if (trimmed && !trimmed.startsWith("<")) firstPrompt = trimmed.slice(0, 200);
    }
    if (cwd && firstPrompt) break;
  }
  return { cwd, firstPrompt };
}

/** 1 つの記録のファイルの様子 */
async function infoOf(sessionId: string, file: string): Promise<SessionFileInfo | null> {
  const st = await stat(file).catch(() => null);
  if (!st?.isFile()) return null;
  const head = await readSessionHead(file).catch(() => ({ cwd: null, firstPrompt: null }));
  return { sessionId, file, size: st.size, modifiedAt: st.mtime.toISOString(), ...head };
}

/** セッションの記録のファイルの様子（作業フォルダから決まる場所 → すべてのプロジェクトのフォルダ。なければ null） */
export async function sessionFileInfo(sessionId: string, cwds: string[], root = claudeProjectsDir()): Promise<SessionFileInfo | null> {
  const file = await findSessionFile(sessionId, cwds, root);
  return file ? infoOf(sessionId, file) : null;
}

/** すべての会話記録のファイル（どのチャットも使っていない記録の一覧の元。新しい順） */
export async function listSessionFiles(root = claudeProjectsDir()): Promise<SessionFileInfo[]> {
  const out: SessionFileInfo[] = [];
  for (const dir of await readdir(root).catch(() => [] as string[])) {
    for (const name of await readdir(join(root, dir)).catch(() => [] as string[])) {
      const m = SESSION_FILE.exec(name);
      if (!m) continue;
      const info = await infoOf(m[1], join(root, dir, name));
      if (info) out.push(info);
    }
  }
  return out.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

/** Claude Code の会話記録の口（ClaudeProvider.sessions。探して切り出し・写し・ゴミ箱へ・様子・一覧・大きさ） */
export const claudeSessionStore: SessionStore = {
  /** チャットを消したとき、そのセッションの記録をゴミ箱へ移す（見つからなければすべてのプロジェクトから探す） */
  discard: (sessionIds, cwds, trash) => trashSessions(sessionIds, cwds, trash),
  /** 長く続けたセッションを、終わりの直近 3 区切りだけの新しいセッションにする（切るものがなければ null） */
  async trim(sessionId, cwd) {
    const file = await findSessionFile(sessionId, [cwd]).catch(() => null);
    if (!file) return null;
    const trimmed = await trimToRecentSegments(file, sessionId);
    return trimmed ? { sessionId: trimmed.sessionId, previousFile: file } : null;
  },
  /** 作業場所を移すとき、会話を新しいセッションに写す（元の記録が見つからなければ null） */
  async copyForMove(sessionId, cwd) {
    const file = await findSessionFile(sessionId, [cwd]).catch(() => null);
    if (!file) return null;
    const copied = await copyForWorkplaceMove(file, sessionId);
    return { sessionId: copied.sessionId, previousFile: file };
  },
  info: (sessionId, cwds) => sessionFileInfo(sessionId, cwds),
  list: () => listSessionFiles(),
  /** 作業フォルダから決まる場所だけを見る（アーカイブ済みのチャットの整理の見込み） */
  size: (sessionIds, cwds) => sessionFilesSize(sessionIds, cwds),
};
