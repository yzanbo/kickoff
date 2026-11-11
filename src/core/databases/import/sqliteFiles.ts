import fs from "node:fs/promises";
import path from "node:path";

// プロジェクトの中の SQLite のファイル（*.sqlite / *.sqlite3 / *.db / *.db3）を探す。中身の頭が SQLite の印のものだけ

const EXTENSIONS = new Set([".sqlite", ".sqlite3", ".db", ".db3"]);
/** 中を見ないフォルダ（依存・作ったもの・キャッシュ）。「.」で始まるフォルダも見ない */
const SKIP_DIRS = new Set(["node_modules", "vendor", "dist", "build", "out", "target", "coverage", "Pods", "venv", "__pycache__", "bower_components"]);
const MAX_DEPTH = 4;
const MAX_DIRS = 2000;
const MAX_FILES = 50;
const HEADER = Buffer.from("SQLite format 3\0", "latin1");

async function isSqlite(file: string): Promise<boolean> {
  let handle: fs.FileHandle | null = null;
  try {
    handle = await fs.open(file, "r");
    const buf = Buffer.alloc(HEADER.length);
    const { bytesRead } = await handle.read(buf, 0, HEADER.length, 0);
    return bytesRead === HEADER.length && buf.equals(HEADER);
  } catch {
    return false;
  } finally {
    await handle?.close();
  }
}

/** プロジェクトフォルダからの相対パスで返す（4 段まで・見るフォルダは 2000 まで・50 個まで。リンクはたどらない） */
export async function findSqliteFiles(root: string): Promise<string[]> {
  const found: string[] = [];
  const queue: { dir: string; depth: number }[] = [{ dir: root, depth: 0 }];
  let visited = 0;
  while (queue.length > 0 && visited < MAX_DIRS && found.length < MAX_FILES) {
    const { dir, depth } = queue.shift()!;
    visited++;
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (depth < MAX_DEPTH && !SKIP_DIRS.has(entry.name)) queue.push({ dir: full, depth: depth + 1 });
      } else if (entry.isFile() && EXTENSIONS.has(path.extname(entry.name).toLowerCase()) && (await isSqlite(full))) {
        found.push(path.relative(root, full));
        if (found.length >= MAX_FILES) break;
      }
    }
  }
  return found;
}
