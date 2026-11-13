// ワークツリーの実行環境のファイルの読み書き（.env を写す・Git に無視させる・開発サーバーの見分け）
import fs from "node:fs/promises";
import path from "node:path";
import { gitOutput } from "../git/exec.js";

/** 見本の .env（値は仮のもの）は写さない */
const ENV_SAMPLE = /\.(example|sample|template|dist|defaults?)$/i;

/** Kickoff が書くファイルを置くフォルダ（compose のフォルダごと。.git/info/exclude で無視させる） */
export const KICKOFF_DIR = ".kickoff";
/** 上書きファイル（compose のフォルダからの相対） */
export const OVERRIDE_FILE = `${KICKOFF_DIR}/compose.worktree.yaml`;

export const exists = (p: string) => fs.stat(p).then(() => true, () => false);

/** フォルダの直下の .env たち（.env・.env.local など。見本は除く。名前の順） */
export async function envFilesIn(dir: string): Promise<string[]> {
  const names = await fs.readdir(dir).catch(() => [] as string[]);
  return names.filter((n) => /^\.env(\..+)?$/.test(n) && !ENV_SAMPLE.test(n)).sort();
}

const gitOk = (cwd: string, args: string[]) =>
  gitOutput(cwd, args).then(
    () => true,
    () => false,
  );

/** Git で管理しているファイルか（rel は cwd からの相対） */
export const isTracked = (cwd: string, rel: string) => gitOk(cwd, ["ls-files", "--error-unmatch", "--", rel]);
/** Git で無視しているか（まだないファイルでも .gitignore で決まる） */
export const isIgnored = (cwd: string, rel: string) => gitOk(cwd, ["check-ignore", "-q", "--", rel]);

/** .git/info/exclude に足す（同じ行があれば何もしない。exclude はワークツリーで共通） */
export async function addGitExclude(cwd: string, pattern: string): Promise<void> {
  const common = (await gitOutput(cwd, ["rev-parse", "--git-common-dir"])).trim();
  const file = path.join(path.resolve(cwd, common), "info", "exclude");
  const text = await fs.readFile(file, "utf8").catch(() => "");
  if (text.split("\n").some((l) => l.trim() === pattern)) return;
  await fs.mkdir(path.dirname(file), { recursive: true });
  const head = text && !text.endsWith("\n") ? "\n" : "";
  await fs.appendFile(file, `${head}# Kickoff（ワークツリーの実行環境が書くファイル）\n${pattern}\n`);
}

/**
 * 開発サーバーが PORT を読まないと分かる作り（いまは Vite だけ。package.json の scripts.dev が vite を起動し、PORT も --port も渡していない）。
 * 分かったら知らせの文、なければ null
 */
export async function devServerIssue(dir: string): Promise<string | null> {
  try {
    const pkg = JSON.parse(await fs.readFile(path.join(dir, "package.json"), "utf8")) as { scripts?: Record<string, unknown> };
    const dev = typeof pkg.scripts?.dev === "string" ? pkg.scripts.dev : "";
    if (/\bvite\b/.test(dev) && !/\$\{?PORT\b|--port\b/.test(dev)) return "開発サーバー（Vite）は環境変数 PORT を読みません。vite.config の server.port を process.env.PORT にするか、--port $PORT を付けてください";
  } catch {
    // package.json がない・読めない
  }
  return null;
}
