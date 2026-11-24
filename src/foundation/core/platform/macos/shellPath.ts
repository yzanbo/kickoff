// ログインシェルの PATH を非同期で読む。
// Finder から起動した macOS のアプリはログインシェルの PATH を引き継がないので、エージェント・git・gh・docker・ターミナルのために取り込む。
// 起動の途中で $SHELL -ilc を同期で流すと .zshrc が重いとき数百 ms 止まるので、保存先の shell-path.json の前回の値を先に入れ、
// 読み直しは裏で流し、読めたら入れ替えて書き直す。外部コマンドを起こす所だけが ready（読み終わるか timeoutMs で打ち切り）を待つ
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { searchDirs } from "@/foundation/core/system/exec";
import { systemClock, type Clock, type TimerHandle } from "@/foundation/core/clock";

/** 前回の値を置くファイル（保存先 = AI から書けない場所。~/Library/Caches は砂場で書ける） */
export const SHELL_PATH_FILE = "shell-path.json";
/** 外部コマンドを起こす所が、読み直しを待つ上限 */
const SHELL_PATH_WAIT_MS = 5_000;
/** ログインシェルを待つ上限（これを過ぎたら前回の値のまま） */
const SHELL_TIMEOUT_MS = 10_000;

export interface ShellPath {
  /** 読み直し終えた・読めなかった・timeoutMs を過ぎたら解ける（失敗しない） */
  ready: Promise<void>;
}

/** PATH の文字から、: で区切った絶対パスだけを残す（重なりは除く） */
export function cleanPath(value: string): string[] {
  return [...new Set(value.split(":").filter((dir) => path.isAbsolute(dir)))];
}

/** 前と後ろをつなぐ（前のものを先に。重なりは除く） */
const merged = (first: string[], rest: string) => [...new Set([...first, ...cleanPath(rest)])].join(":");

/** 保存した前回の値（なければ・壊れていれば null） */
function readSavedPath(file: string): string[] | null {
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8")) as { path?: unknown };
    if (typeof data.path !== "string") return null;
    const dirs = cleanPath(data.path);
    return dirs.length > 0 ? dirs : null;
  } catch {
    return null;
  }
}

/** ログインシェルの PATH を読む（$SHELL -ilc。読めなければ null） */
function readLoginShellPath(): Promise<string | null> {
  const shell = process.env.SHELL || "/bin/zsh";
  const marker = "__KICKOFF_PATH__";
  return new Promise((resolve) => {
    // 終了コードが 0 でなくても（.zshrc の途中の失敗など）、印の間の PATH が出ていれば使う
    execFile(shell, ["-ilc", `printf '${marker}%s${marker}' "$PATH"`], { encoding: "utf8", timeout: SHELL_TIMEOUT_MS }, (_error, stdout) => {
      const match = String(stdout ?? "").match(new RegExp(`${marker}(.*)${marker}`));
      resolve(match?.[1] || null);
    });
  });
}

/**
 * PATH の用意を始める: 前回の値（なければ探す場所の既定 searchDirs）をいまの PATH の前に入れ、ログインシェルの読み直しを裏で始める。
 * 読めたら、起動したときの PATH の前にその値を入れて入れ替え、ファイルを書き直す。read・時計・env はテストで差し替える
 */
export function startShellPath(opts: {
  dataDir: string;
  read?: () => Promise<string | null>;
  timeoutMs?: number;
  clock?: Pick<Clock, "setTimeout" | "clearTimeout" | "iso">;
  env?: NodeJS.ProcessEnv;
}): ShellPath {
  const env = opts.env ?? process.env;
  const file = path.join(opts.dataDir, SHELL_PATH_FILE);
  const original = env.PATH ?? "";
  const saved = readSavedPath(file);
  env.PATH = saved ? merged(saved, original) : merged(searchDirs(original), "");
  const clock = opts.clock ?? systemClock;
  const read = (opts.read ?? readLoginShellPath)().then(
    (value) => {
      const dirs = value ? cleanPath(value) : [];
      if (dirs.length === 0) return;
      env.PATH = merged(dirs, original);
      try {
        fs.writeFileSync(file, JSON.stringify({ path: dirs.join(":"), at: clock.iso() }));
      } catch {
        // 書けなくても、次の起動で読み直すだけ
      }
    },
    () => {},
  );
  let timer: TimerHandle | null = null;
  const timeout = new Promise<void>((resolve) => {
    timer = clock.setTimeout(resolve, opts.timeoutMs ?? SHELL_PATH_WAIT_MS);
  });
  const ready = Promise.race([read, timeout]).then(() => clock.clearTimeout(timer));
  return { ready };
}
