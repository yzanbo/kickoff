// CI のタブの純粋な部分（開いている実行の読み書き・自動で取り直すか・開くジョブとステップ・「AI に渡す」の札の中身と一言）
import type { CiFailedLog, CiJob, CiRun, CiRunList, GitHubLink } from "@shared/types";

/** 開いている実行（ciSelected の「実行の ID」か「実行の ID:ジョブの ID」） */
export interface CiSelection {
  runId: number;
  jobId: number | null;
}

export function parseCiSelected(text: string): CiSelection | null {
  const m = /^(\d+)(?::(\d+))?$/.exec(text);
  return m ? { runId: Number(m[1]), jobId: m[2] ? Number(m[2]) : null } : null;
}

export const ciSelectedText = (runId: number, jobId: number | null = null) => (jobId === null ? String(runId) : `${runId}:${jobId}`);

/** 動いている実行・外の CI があるか（あれば一覧を自動で取り直す） */
export const hasPending = (list: CiRunList | null | undefined): boolean => !!list && (list.runs.some((r) => r.state === "pending") || list.external.some((c) => c.state === "pending"));

/** 初めに開くジョブ（指したジョブ → 落ちたジョブの最初 → 動いているジョブの最初。どれもなければ開かない） */
export function jobToOpen(jobs: CiJob[], jobId: number | null): CiJob | null {
  return jobs.find((j) => j.id === jobId) ?? jobs.find((j) => j.state === "failure") ?? jobs.find((j) => j.state === "pending") ?? null;
}

/** 初めに開くステップ（落ちたステップの最初。なければ開かない） */
export const stepToOpen = (job: CiJob): string | null => job.steps.find((s) => s.state === "failure")?.name ?? null;

/** 実行の名前（「CI #12」） */
export const runName = (run: Pick<CiRun, "workflow" | "number">) => `${run.workflow} #${run.number}`;

/** 結び付けるもの（実行に PR があれば、その PR） */
export function ciLinkOf(run: CiRun, repo: string): GitHubLink | undefined {
  return run.pulls.length > 0 && repo ? { repo, kind: "pr", number: run.pulls[0] } : undefined;
}

/** 札のファイル名（ci-CI-12-failed.md。ファイル名に使えない文字は - に） */
export const ciCaptureName = (run: Pick<CiRun, "workflow" | "number">) => `ci-${run.workflow.replace(/[^\p{L}\p{N}_.-]+/gu, "-")}-${run.number}-failed.md`;

/** 中身に含まれるいちばん長い ` の並びより長い囲み（ログに ``` があっても囲みが切れないように） */
function fenceFor(text: string): string {
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((m) => m[0].length));
  return "`".repeat(Math.max(3, longest + 1));
}

/** 札の中身（実行の様子と、落ちたステップのログ。gh run view --log-failed の範囲） */
export function ciFailedDocument(log: CiFailedLog): string {
  const { run } = log;
  const head = [
    `# CI の失敗ログ: ${runName(run)}`,
    "",
    `- ワークフロー: ${runName(run)}${run.attempt > 1 ? `（${run.attempt} 回目の試み）` : ""}`,
    `- ブランチ: ${run.branch ?? "（なし）"}`,
    `- コミット: ${run.sha.slice(0, 7)}`,
    `- 題: ${run.title}`,
    ...(run.pulls.length > 0 ? [`- PR: ${run.pulls.map((n) => `#${n}`).join(", ")}`] : []),
    `- GitHub: ${run.url}`,
  ];
  if (log.steps.length === 0) return [...head, "", "落ちたステップのログを GitHub から取れませんでした。GitHub のページで確かめてください。", ""].join("\n");
  const sections = log.steps.map(({ job, step, lines }) => {
    const body = lines.join("\n");
    const fence = fenceFor(body);
    return [`## ${job} / ${step}`, "", `${fence}text`, body, fence].join("\n");
  });
  return [...head, "", ...sections.flatMap((s) => [s, ""])].join("\n");
}

/** 「AI に渡す」の一言（入力欄に入れる。書き換えられる） */
export const ciHandOffText = (run: CiRun) => `CI（${runName(run)}・${run.branch ?? "ブランチなし"}）が落ちました。添付の失敗ログを読んで、原因を調べてください。`;

/** 「（ブランチ名）で直す」の一言 */
export const ciFixText = (run: CiRun) =>
  `CI（${runName(run)}・${run.branch ?? "ブランチなし"}）が落ちました。添付の失敗ログを読んで原因を直し、手元で同じ確かめ（テスト・ビルドなど）が通ることを確かめてください。`;

/** ログの 1 行の見え方（GitHub Actions の「##[group]」などの印を読む。endgroup は出さない） */
export type CiLogLine = { kind: "line" | "group" | "error" | "warning" | "notice"; text: string } | { kind: "hidden" };

export function ciLogLine(line: string): CiLogLine {
  const m = /^##\[(group|endgroup|error|warning|notice|debug|command)\](.*)$/.exec(line);
  if (!m) return { kind: "line", text: line };
  const [, mark, text] = m;
  if (mark === "endgroup") return { kind: "hidden" };
  if (mark === "group" || mark === "error" || mark === "warning" || mark === "notice") return { kind: mark, text };
  return { kind: "line", text };
}

/** ジョブのステップに、ログのステップを名前で当てる（同じ名前は前から順に。当たらなかったログは後ろに足す） */
export function stepsWithLogs<S extends { name: string }, L extends { name: string }>(steps: S[], logs: L[]): { step: S | null; name: string; log: L | null }[] {
  const left = [...logs];
  const rows: { step: S | null; name: string; log: L | null }[] = steps.map((step) => {
    const i = left.findIndex((l) => l.name === step.name);
    const log = i < 0 ? null : left.splice(i, 1)[0];
    return { step, name: step.name, log };
  });
  return [...rows, ...left.map((log) => ({ step: null, name: log.name, log }))];
}
