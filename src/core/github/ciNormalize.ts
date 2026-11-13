// CI の結果（GitHub Actions の REST の応答・gh run view のログ）を画面の形にする（純粋な関数。テストは ciNormalize.test.ts）
import type { CiExternalCheck, CiJob, CiRun, CiState, CiStepLog } from "@shared/types";

// GitHub の答えは形が決まらないので、読むところだけ any で受ける
type Raw = any;

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

/** GitHub の status と conclusion（check run・workflow run・job・step 共通）を 1 つの状態にする */
export function ciStateOf(status: unknown, conclusion: unknown): CiState {
  if (status !== "completed") return "pending";
  switch (conclusion) {
    case "success":
      return "success";
    case "failure":
    case "timed_out":
    case "startup_failure":
    case "action_required":
      return "failure";
    case "cancelled":
      return "cancelled";
    case "skipped":
      return "skipped";
    default:
      return "neutral";
  }
}

/** commit status の state（error / failure / pending / success）を状態にする */
export function commitStatusState(state: unknown): CiState {
  if (state === "success") return "success";
  if (state === "failure" || state === "error") return "failure";
  return "pending";
}

/** REST の workflow run 1 つ */
export function toCiRun(raw: Raw): CiRun {
  return {
    id: Number(raw?.id ?? 0),
    workflow: str(raw?.name) ?? "（名前のないワークフロー）",
    number: Number(raw?.run_number ?? 0),
    attempt: Number(raw?.run_attempt ?? 1),
    title: str(raw?.display_title) ?? str(raw?.head_commit?.message)?.split("\n")[0] ?? "",
    branch: str(raw?.head_branch),
    event: str(raw?.event) ?? "",
    sha: String(raw?.head_sha ?? ""),
    state: ciStateOf(raw?.status, raw?.conclusion),
    url: String(raw?.html_url ?? ""),
    pulls: (Array.isArray(raw?.pull_requests) ? raw.pull_requests : []).map((p: Raw) => Number(p?.number)).filter((n: number) => Number.isInteger(n) && n > 0),
    actor: str(raw?.actor?.login),
    created_at: String(raw?.created_at ?? ""),
    updated_at: String(raw?.updated_at ?? raw?.created_at ?? ""),
  };
}

/** REST の job 1 つ（ステップは番号の順） */
export function toCiJob(raw: Raw): CiJob {
  const steps = (Array.isArray(raw?.steps) ? raw.steps : []).map((s: Raw) => ({ number: Number(s?.number ?? 0), name: String(s?.name ?? ""), state: ciStateOf(s?.status, s?.conclusion) }));
  return {
    id: Number(raw?.id ?? 0),
    name: String(raw?.name ?? ""),
    state: ciStateOf(raw?.status, raw?.conclusion),
    started_at: str(raw?.started_at),
    completed_at: str(raw?.completed_at),
    url: str(raw?.html_url),
    steps: steps.sort((a: { number: number }, b: { number: number }) => a.number - b.number),
  };
}

/**
 * ブランチの先頭のコミットの、外の CI の成否（commit status と、GitHub Actions でない check run）。
 * statusBody は REST の commits/{ref}/status、checksBody は commits/{ref}/check-runs の答え
 */
export function toExternalChecks(branch: string, statusBody: Raw, checksBody: Raw): CiExternalCheck[] {
  const sha = String(statusBody?.sha ?? checksBody?.check_runs?.[0]?.head_sha ?? "");
  const statuses = (Array.isArray(statusBody?.statuses) ? statusBody.statuses : []).map(
    (s: Raw): CiExternalCheck => ({
      name: String(s?.context ?? ""),
      branch,
      sha,
      state: commitStatusState(s?.state),
      description: str(s?.description),
      url: str(s?.target_url),
      updated_at: str(s?.updated_at),
    }),
  );
  const checks = (Array.isArray(checksBody?.check_runs) ? checksBody.check_runs : [])
    .filter((c: Raw) => c?.app?.slug !== "github-actions")
    .map(
      (c: Raw): CiExternalCheck => ({
        name: String(c?.name ?? ""),
        branch,
        sha: String(c?.head_sha ?? sha),
        state: ciStateOf(c?.status, c?.conclusion),
        description: str(c?.output?.title),
        url: str(c?.details_url) ?? str(c?.html_url),
        updated_at: str(c?.completed_at) ?? str(c?.started_at),
      }),
    );
  return [...statuses, ...checks];
}

/** 行の頭の時刻（gh run view --log の各行。頭に BOM が付くことがある） */
const LINE_TIME = /^\uFEFF?\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z ?/;

/** gh が書く「^[[」（ESC を ^ と [ で書いたもの）の色の印 */
const CARET_ESC = /\^\[\[(?=[0-9;?]*[ -/]*[@-~])/g;

/**
 * gh run view --log（--log-failed）の出力（1 行 =「ジョブの名前 \t ステップの名前 \t 時刻 行」）を、ジョブ・ステップごとに分ける。
 * 出てきた順を保ち、行の頭の時刻は外す（色の制御文字は残す。gh が「^[」と書いたものは ESC に戻す）。形の違う行は前のステップの続きにする
 */
export function parseRunLog(text: string): { job: string; step: string; lines: string[] }[] {
  const out: { job: string; step: string; lines: string[] }[] = [];
  for (const raw of text.split("\n")) {
    if (raw === "" && out.length === 0) continue;
    const first = raw.indexOf("\t");
    const second = first < 0 ? -1 : raw.indexOf("\t", first + 1);
    // gh は端末でないとき ESC を「^[」の 2 文字で書くので、色の印に戻す（画面で色を付け、AI に渡すときは外せるように）
    const line = (second < 0 ? raw : raw.slice(second + 1)).replace(LINE_TIME, "").replace(/\r$/, "").replace(CARET_ESC, "\u001b[");
    const job = second < 0 ? (out.at(-1)?.job ?? "") : raw.slice(0, first);
    const step = second < 0 ? (out.at(-1)?.step ?? "") : raw.slice(first + 1, second);
    const last = out.at(-1);
    if (last && last.job === job && last.step === step) last.lines.push(line);
    else out.push({ job, step, lines: [line] });
  }
  // 終わりの改行でできた空の行は落とす
  const tail = out.at(-1);
  if (tail && tail.lines.at(-1) === "") tail.lines.pop();
  return out;
}

/** 1 つのジョブのログを、ステップごとにまとめる（同じ名前のステップが離れて出ても 1 つに。出てきた順） */
export function stepLogsOf(text: string): CiStepLog[] {
  const steps = new Map<string, string[]>();
  for (const part of parseRunLog(text)) steps.set(part.step, [...(steps.get(part.step) ?? []), ...part.lines]);
  return [...steps].map(([name, lines]) => ({ name, lines }));
}

/** 色・カーソルの制御文字（ANSI のエスケープ）を外す（AI に渡す札の中身） */
export const stripAnsi = (text: string): string => text.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "");

/**
 * 失敗を知らせる実行（純粋な関数）: 見張るブランチの、ワークフローごとのいちばん新しい実行（同じブランチ・同じワークフローの古い実行は見ない =
 * 落ちたあと通ったものは知らせない）のうち、終わって落ちていて、まだ知らせておらず、終わってから recentMs 以内のもの
 * （Kickoff を入れた・見張りを入れたときに、ずっと前の失敗をまとめて知らせない）
 */
export function failuresToNotify(runs: CiRun[], branches: Set<string>, notified: Set<number>, now: number, recentMs: number): CiRun[] {
  const latest = new Map<string, CiRun>();
  for (const run of runs) {
    if (!run.branch || !branches.has(run.branch)) continue;
    const key = `${run.branch}\u0000${run.workflow}`;
    const seen = latest.get(key);
    if (!seen || run.created_at > seen.created_at || (run.created_at === seen.created_at && run.id > seen.id)) latest.set(key, run);
  }
  return [...latest.values()].filter((r) => r.state === "failure" && !notified.has(r.id) && now - Date.parse(r.updated_at) <= recentMs).sort((a, b) => a.id - b.id);
}
