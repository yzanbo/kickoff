import { ArrowUpRight, ChevronRight, History, OctagonPause } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import type { RestartResume, RestartResumeAction } from "@shared/types";
import { api } from "@/foundation/ui/api";
import { openChat } from "@/foundation/ui/navigation/router";
import { useModalDialog } from "@/foundation/ui/hooks/useModalDialog";
import { useAction } from "@/foundation/ui/hooks/useAction";
import { useWindowEvent } from "@/foundation/ui/hooks/useWindowEvent";
import { cx } from "@/foundation/ui/lib/cx";
import { formatMessageTime } from "@/foundation/ui/lib/time";
import { useProjects } from "@/features/projects/ui/stores/projects";
import { autoOpenRestartResumes, restartResumesStore, useRestartResumes } from "./restartResumes";
import { DialogActions } from "@/foundation/ui/kit/DialogActions";
import { ErrorText } from "@/foundation/ui/kit/ErrorText";
import { Segmented } from "@/foundation/ui/kit/Segmented";
import { chatTitle } from "@/features/chat/ui/chatTitle";
import { ProjectMark } from "@/features/projects/ui/ProjectMark";
import { queueActionOf } from "@shared/chat/queueActions";
import { nextQueuedText } from "@/features/queue/ui/queuedHint";
import { defaultResumeChoice, resumeActionsFor, resumeChoiceLabel, resumeChoiceTip, type RestartResumeChoice } from "./restartResumeChoices";

/** ダイアログを開き直す知らせ（下の帯の「決めていない再開」から） */
const OPEN_RESTART_RESUMES_EVENT = "kickoff:open-restart-resumes";

/** 起動したときの再開の確かめのダイアログを開き直す */
function openRestartResumes() {
  window.dispatchEvent(new Event(OPEN_RESTART_RESUMES_EVENT));
}

/** 選んだ答えの内訳の名前（チャットごとの名前は送信待ちがあるかで変わるので、内訳は短い共通の名前にする） */
const SUMMARY_LABELS: Record<RestartResumeChoice, string> = { send: "送る", continue: "続ける", pause: "止めておく", later: "あとで" };

/**
 * 起動したときの再開の確かめ（App がメインウィンドウにだけ置く）。前回の終了で、作業の途中で止まった・自動で送るまま送信待ちが残ったチャットがあれば、
 * ダイアログを出す（まだ見せていないチャットが届いたときだけ。コアのプロセスを作り直したあとに新しく止まったチャットでも開く）。
 * 閉じても決めていないものは残り（コアは続けず・送らない）、下の帯の「決めていない再開」から開き直せる
 */
export function RestartResumeHost() {
  const resumes = useRestartResumes();
  const [open, setOpen] = useState(false);
  // 前に見せた一覧のチャット（見せたものは、閉じたあとは下の帯から開き直す）
  const shown = useRef<ReadonlySet<number>>(new Set());
  useEffect(() => {
    const next = autoOpenRestartResumes(shown.current, resumes);
    shown.current = next.shown;
    if (next.open) setOpen(true);
  }, [resumes]);
  useWindowEvent(OPEN_RESTART_RESUMES_EVENT, () => setOpen(true));
  if (!open || resumes.length === 0) return null;
  return <RestartResumeDialog resumes={resumes} onClose={() => setOpen(false)} />;
}

/**
 * ダイアログ「前回の終了で止まったチャットがあります」: チャットごとに、止まったところ（最後の指示・AI の最後の返答・最後のツール）・
 * 止まったサブエージェント・送信待ちのすべてを開いて見られ、送る（送信待ちがあるチャットだけ）/ 続ける・続けてから送る（作業の途中で止まったチャットだけ）/
 * 止めておく・止めたまま / あとで を選ぶ。「チャットで見て決める」でそのチャットを開いて閉じる（そのチャットの入力欄の上の帯で決められる）。
 * 「あとで決める」・Esc は何も送らずに閉じる（決めていないものはそのまま残る）
 */
function RestartResumeDialog({ resumes, onClose }: { resumes: RestartResume[]; onClose: () => void }) {
  // 選んでいる途中で、背景を押して閉じない
  const { ref: dialogRef, ...dialog } = useModalDialog({ closeOnBackdrop: false, focusSelf: true });
  const [choices, setChoices] = useState<Record<number, RestartResumeChoice>>({});
  const [opened, setOpened] = useState<Record<number, boolean>>({});
  const action = useAction();
  const choiceOf = (r: RestartResume) => choices[r.chat_id] ?? defaultResumeChoice(r);
  const decided = resumes.filter((r) => choiceOf(r) !== "later");

  const decide = async () => {
    const ok = await action.run("decide", async () => {
      restartResumesStore.set(
        await api.resolveRestartResumes(decided.map((r) => ({ chat_id: r.chat_id, action: choiceOf(r) as RestartResumeAction }))),
      );
    });
    if (ok) dialog.close();
  };

  return (
    <dialog ref={dialogRef} className="dialog app-dialog restart-resume-dialog" aria-label="前回の終了で止まったチャットがあります" onClose={onClose}>
      <form
        className="app-dialog-body"
        onSubmit={(e) => {
          e.preventDefault();
          void decide();
        }}
      >
        <div className="restart-resume-intro">
          <h2 className="app-dialog-title">前回の終了で止まったチャットがあります</h2>
          <p className="app-dialog-message">
            前回アプリを終えたとき、作業の途中だった・自動で送る送信待ちが残っていたチャットです。決めるまでは続けず、送りません。中身を見て、チャットごとに選んでください。
          </p>
        </div>
        <ul className="restart-resume-list">
          {resumes.map((r) => (
            <RestartResumeCard
              key={r.chat_id}
              resume={r}
              choice={choiceOf(r)}
              open={opened[r.chat_id] ?? resumes.length === 1}
              onToggle={() => setOpened((prev) => ({ ...prev, [r.chat_id]: !(prev[r.chat_id] ?? resumes.length === 1) }))}
              onChoose={(c) => setChoices((prev) => ({ ...prev, [r.chat_id]: c }))}
              onOpenChat={() => {
                dialog.close();
                openChat(r.project_id, r.chat_id);
              }}
            />
          ))}
        </ul>
        <ErrorText message={action.error} />
        <DialogActions className="app-dialog-actions restart-resume-actions">
          <span className="restart-resume-summary muted small">{summaryOf(resumes.map(choiceOf))}</span>
          <button type="button" className="btn" disabled={action.busy !== null} onClick={() => dialog.close()} title="何も送らずに閉じます。下の帯の「決めていない再開」から、また開けます">
            あとで決める
          </button>
          <button type="submit" className="btn btn-primary" disabled={action.busy !== null || decided.length === 0}>
            {action.busy ? "送っています…" : "この内容で決める"}
          </button>
        </DialogActions>
      </form>
    </dialog>
  );
}

/** 選んだ答えの内訳（「送る 1 · 続ける 1 · あとで 1」） */
function summaryOf(choices: RestartResumeChoice[]): string {
  const order: RestartResumeChoice[] = ["send", "continue", "pause", "later"];
  return order
    .map((c) => [c, choices.filter((x) => x === c).length] as const)
    .filter(([, n]) => n > 0)
    .map(([c, n]) => `${SUMMARY_LABELS[c]} ${n}`)
    .join(" · ");
}

/**
 * 1 つのチャットのカード: 見出し（プロジェクト・名前・止まった時刻・途中で止まったか）・送信待ちの 1 行（なければ最後の指示の 1 行）・詳しく見る・
 * 選ぶ切り替え・チャットで見て決める
 */
function RestartResumeCard({
  resume: r,
  choice,
  open,
  onToggle,
  onChoose,
  onOpenChat,
}: {
  resume: RestartResume;
  choice: RestartResumeChoice;
  open: boolean;
  onToggle: () => void;
  onChoose: (choice: RestartResumeChoice) => void;
  onOpenChat: () => void;
}) {
  const { projectsById } = useProjects();
  const project = projectsById.get(r.project_id);
  const title = chatTitle(r.title);
  const options: RestartResumeChoice[] = [...resumeActionsFor(r), "later"];
  return (
    <li className={cx("restart-resume-row", choice === "later" && "later")}>
      <div className="restart-resume-head">
        {project && <ProjectMark project={project} />}
        <span className="restart-resume-title" title={project ? `${project.name} / ${title}` : title}>
          {title}
        </span>
        {r.stopped_at && <span className="restart-resume-time muted small">{formatMessageTime(r.stopped_at)} に停止</span>}
        <button
          type="button"
          className="link-button small restart-resume-open"
          onClick={onOpenChat}
          title="このチャットを開いて、会話を見ながら決めます（入力欄の上の帯で決められます）。ほかのチャットの選択は送らずに閉じます"
        >
          チャットで見て決める <ArrowUpRight size={12} aria-hidden />
        </button>
      </div>
      {r.interrupted && (
        <div className="restart-resume-note small">
          アプリの終了で、作業の途中で止まりました{r.subagents.length > 0 && `（サブエージェント ${r.subagents.length} 件も途中）`}
        </div>
      )}
      <button type="button" className="restart-resume-toggle" aria-expanded={open} onClick={onToggle}>
        <ChevronRight size={13} className="restart-resume-chevron" aria-hidden />
        <span className="restart-resume-count">{r.queued ? `送信待ち ${r.messages.length} 件` : "止まったときの様子"}</span>
        {!open && r.queued && <span className="restart-resume-next">次: {nextQueuedText(r.messages[0])}</span>}
        {!open && !r.queued && r.last_prompt && <span className="restart-resume-next">指示: {r.last_prompt.text.split("\n")[0]}</span>}
        <span className="restart-resume-toggle-label muted small">{open ? "閉じる" : "詳しく見る"}</span>
      </button>
      {open && <RestartResumeDetails resume={r} />}
      <div className="restart-resume-foot">
        <Segmented<RestartResumeChoice>
          className="segmented restart-resume-choice"
          label={`${title} をどうするか`}
          value={choice}
          options={options.map((c) => ({ value: c, label: resumeChoiceLabel(c, r.queued), tip: resumeChoiceTip(c, r.queued) }))}
          onChange={onChoose}
        />
      </div>
    </li>
  );
}

/** 詳しく見る: 止まったところ（最後の指示・AI の最後の返答・最後のツール）・止まったサブエージェントと、送信待ちのすべて（一時停止の線も同じ並びで） */
function RestartResumeDetails({ resume: r }: { resume: RestartResume }) {
  const moments = [
    { label: "最後の指示", moment: r.last_prompt, className: "prompt" },
    { label: "AI の最後の返答", moment: r.last_reply, className: "reply" },
    { label: "最後のツール", moment: r.last_tool, className: "tool" },
  ].filter((m) => m.moment !== null);
  const stopLine = (key: string) => (
    <li key={key} className="restart-resume-stop small">
      <OctagonPause size={12} aria-hidden /> 一時停止
    </li>
  );
  return (
    <div className="restart-resume-details">
      {moments.length > 0 && (
        <section className="restart-resume-section">
          <h3 className="restart-resume-section-title">止まったところ</h3>
          <dl className="restart-resume-moments">
            {moments.map(({ label, moment, className }) => (
              <Fragment key={label}>
                <dt className="muted small">
                  {label}
                  <span className="restart-resume-moment-time"> {formatMessageTime(moment!.at)}</span>
                </dt>
                <dd className={cx("restart-resume-moment", className)}>{moment!.text}</dd>
              </Fragment>
            ))}
          </dl>
        </section>
      )}
      {r.subagents.length > 0 && (
        <section className="restart-resume-section">
          <h3 className="restart-resume-section-title">途中で止まったサブエージェント {r.subagents.length} 件</h3>
          <ul className="restart-resume-subagents">
            {r.subagents.map((a, i) => (
              <li key={a.agent_id ?? `i${i}`} className="restart-resume-subagent">
                {a.description || "（説明なし）"}
              </li>
            ))}
          </ul>
        </section>
      )}
      {r.queued && (
        <section className="restart-resume-section">
          <h3 className="restart-resume-section-title">送信待ち {r.messages.length} 件</h3>
          <ol className="restart-resume-queue">
            {r.messages.map((m, i) => (
              <Fragment key={m.id}>
                {r.stops.filter((k) => k === i).map((_, n) => stopLine(`stop-${i}-${n}`))}
                <li className="restart-resume-item">
                  <span className="restart-resume-index muted small">{i + 1}</span>
                  <span className={cx("restart-resume-item-text", queueActionOf(m) && "action")}>{queueActionOf(m) ? nextQueuedText(m) : m.text.trim() || nextQueuedText(m)}</span>
                  {m.attachments.length > 0 && <span className="muted small">添付 {m.attachments.length}</span>}
                </li>
              </Fragment>
            ))}
            {r.stops.filter((k) => k === r.messages.length).map((_, n) => stopLine(`stop-end-${n}`))}
          </ol>
        </section>
      )}
    </div>
  );
}

/** 下の帯の入口: 決めていない再開がある間だけ出し、押すと確かめのダイアログを開き直す */
export function RestartResumeFooterButton() {
  const resumes = useRestartResumes();
  if (resumes.length === 0) return null;
  return (
    <button
      type="button"
      className="footer-button restart-resume-footer"
      title="前回の終了で、作業の途中で止まった・自動で送るまま送信待ちが残ったチャットです。決めるまで続けず、送りません。押すと、中身を見て決めるダイアログを開きます"
      onClick={openRestartResumes}
    >
      <History size={13} aria-hidden /> 決めていない再開 {resumes.length} 件
    </button>
  );
}
