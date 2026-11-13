import { memo, useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import type { CiJob, CiStep, CiStepLog } from "@shared/types";
import { api } from "@/api";
import { useAsync } from "@/hooks/useAsync";
import { cx } from "@/lib/cx";
import { Chevron } from "@/ui/Chevron";
import { ErrorText } from "@/ui/ErrorText";
import { ansiSpans, markSpans } from "@/features/docker/ansi";
import { SpanView } from "@/features/docker/DockerLogRow";
import { CiStateIcon } from "./CiStateIcon";
import { ciLogLine, stepsWithLogs, stepToOpen } from "./ciView";

/**
 * ジョブ 1 つ（見出しを押して開閉）。開いている間だけログを読み、ステップごとに畳んで出す。
 * focus なら（初めに開いたジョブ）落ちたステップを開いて、その位置まで流す
 */
export function CiJobSection({
  projectId,
  runId,
  job,
  duration,
  open,
  focus,
  onToggle,
}: {
  projectId: number;
  runId: number;
  job: CiJob;
  duration: string | null;
  open: boolean;
  focus: boolean;
  onToggle: () => void;
}) {
  return (
    <section className={cx("ci-job", open && "open")}>
      <div className="ci-job-head">
        <button type="button" className="ci-job-toggle" aria-expanded={open} onClick={onToggle}>
          <Chevron open={open} size={14} />
          <CiStateIcon state={job.state} />
          <span className="ci-job-name">{job.name}</span>
          {duration && <span className="muted small">{duration}</span>}
        </button>
        {job.url && <IconLink url={job.url} label="このジョブを GitHub で開く" />}
      </div>
      {/* 状態・終わった時刻が変わったら（動いていたジョブが終わった）読み直す */}
      {open && <CiJobLogBody key={`${job.state}:${job.completed_at ?? ""}`} projectId={projectId} runId={runId} job={job} focus={focus} />}
    </section>
  );
}

function IconLink({ url, label }: { url: string; label: string }) {
  return (
    <a className="ci-job-link" href={url} target="_blank" rel="noreferrer" aria-label={label} data-tip={label}>
      <ExternalLink size={13} aria-hidden />
    </a>
  );
}

/** ジョブのログ（ステップごと）。まだ出ていない（動いている）ときは、その旨と GitHub へのリンク */
function CiJobLogBody({ projectId, runId, job, focus }: { projectId: number; runId: number; job: CiJob; focus: boolean }) {
  const log = useAsync(() => api.ciJobLog(projectId, runId, job.id), [projectId, runId, job.id]);
  if (log.error) return <ErrorText message={log.error} />;
  if (!log.data) return <p className="muted small ci-log-note">ログを読み込み中…</p>;
  const failed = stepToOpen(job);
  // ログがまだ出ていない（動いている）ときも、ステップの進み具合は出す
  const { available, reason } = log.data;
  const rows = stepsWithLogs(job.steps, available ? log.data.steps : []);
  return (
    <div className="ci-steps">
      {!available && (
        <p className="muted small ci-log-note">
          {reason ?? "ログはまだ出ていません。"}
          {job.url && (
            <>
              {" "}
              <a href={job.url} target="_blank" rel="noreferrer">
                GitHub で動いている様子を見る
              </a>
            </>
          )}
        </p>
      )}
      {rows.map((r, i) => (
        <CiStepBlock key={`${i}:${r.name}`} step={r.step} name={r.name} log={r.log} logsReady={available} initiallyOpen={r.name === failed} focus={focus && r.name === failed} />
      ))}
    </div>
  );
}

/** ステップ 1 つ（見出しを押して開閉。落ちたステップは初めから開く） */
function CiStepBlock({
  step,
  name,
  log,
  logsReady,
  initiallyOpen,
  focus,
}: {
  step: CiStep | null;
  name: string;
  log: CiStepLog | null;
  /** ジョブのログが出ているか（出ていなければ「ログなし」と言わない） */
  logsReady: boolean;
  initiallyOpen: boolean;
  focus: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const ref = useRef<HTMLDivElement>(null);
  // 初めに開いたジョブの落ちたステップは、その位置まで流す（描いたあとに 1 回だけ）
  useEffect(() => {
    if (focus) ref.current?.scrollIntoView({ block: "start" });
  }, [focus]);
  const lines = log?.lines ?? [];
  return (
    <div ref={ref} className={cx("ci-step", open && "open")}>
      <button type="button" className="ci-step-toggle" aria-expanded={open} disabled={lines.length === 0} onClick={() => setOpen(!open)}>
        <Chevron open={open} size={13} />
        {step ? <CiStateIcon state={step.state} size={13} /> : <span className="ci-state-space" />}
        <span className="ci-step-name">{name}</span>
        <span className="muted small">{lines.length > 0 ? `${lines.length.toLocaleString()} 行` : logsReady ? "ログなし" : ""}</span>
      </button>
      {open && lines.length > 0 && <CiLogLines lines={lines} />}
    </div>
  );
}

/** ログの行（色はアプリが付けたまま。##[group] は見出し、##[error] は赤） */
const CiLogLines = memo(function CiLogLines({ lines }: { lines: string[] }) {
  return (
    <div className="ci-log" role="log">
      {lines.map((line, i) => {
        const view = ciLogLine(line);
        if (view.kind === "hidden") return null;
        return (
          <div key={i} className={cx("ci-log-line", view.kind !== "line" && `ci-log-${view.kind}`)}>
            <span className="ci-log-no" aria-hidden>
              {i + 1}
            </span>
            <span className="ci-log-text">
              {markSpans(ansiSpans(view.text), []).map((span, j) => (
                <SpanView key={j} span={span} />
              ))}
            </span>
          </div>
        );
      })}
    </div>
  );
});
