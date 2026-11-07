import { ArrowUpRight, ChevronRight, History, OctagonPause } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { QUEUE_RESUME_ACTION_LABELS, type QueueResume, type QueueResumeAction } from "@shared/types";
import { api } from "@/api";
import { openChat } from "@/app/router";
import { useModalDialog } from "@/hooks/useModalDialog";
import { useAction } from "@/hooks/useAction";
import { useWindowEvent } from "@/hooks/useWindowEvent";
import { cx } from "@/lib/cx";
import { formatMessageTime } from "@/lib/time";
import { useProjects } from "@/stores/projects";
import { queueResumesStore, useQueueResumes } from "@/stores/queueResumes";
import { DialogActions } from "@/ui/DialogActions";
import { ErrorText } from "@/ui/ErrorText";
import { Segmented } from "@/ui/Segmented";
import { chatTitle } from "@/features/chat/chatTitle";
import { ProjectMark } from "@/features/project/ProjectMark";
import { queueActionOf } from "@shared/chat/queueActions";
import { nextQueuedText } from "./queuedHint";
import { QUEUE_RESUME_TIPS, defaultResumeChoice, type QueueResumeChoice } from "./queueResumeChoices";

/** ダイアログを開き直す知らせ（下の帯の「決めていない送信待ち」から） */
const OPEN_QUEUE_RESUMES_EVENT = "kickoff:open-queue-resumes";

/** 起動したときの送信待ちの確かめのダイアログを開き直す */
export function openQueueResumes() {
  window.dispatchEvent(new Event(OPEN_QUEUE_RESUMES_EVENT));
}

/** 選べる答えと、決めずに残す「あとで」の名前 */
const CHOICE_LABELS: Record<QueueResumeChoice, string> = { ...QUEUE_RESUME_ACTION_LABELS, later: "あとで" };

/**
 * 起動したときの送信待ちの確かめ（App がメインウィンドウにだけ置く）。前回の終了で、自動で送るまま送信待ちが残ったチャットがあれば、
 * 開いたときに 1 回ダイアログを出す。閉じても決めていないものは残り（コアは送らない）、下の帯の「決めていない送信待ち」から開き直せる
 */
export function QueueResumeHost() {
  const resumes = useQueueResumes();
  const [open, setOpen] = useState(false);
  const shown = useRef(false);
  useEffect(() => {
    // 届いたら 1 回だけ自動で開く（閉じたあとは、下の帯から開き直す）
    if (resumes.length > 0 && !shown.current) {
      shown.current = true;
      setOpen(true);
    }
  }, [resumes.length]);
  useWindowEvent(OPEN_QUEUE_RESUMES_EVENT, () => setOpen(true));
  if (!open || resumes.length === 0) return null;
  return <QueueResumeDialog resumes={resumes} onClose={() => setOpen(false)} />;
}

/**
 * ダイアログ「送信待ちが残っています」: チャットごとに、止まったところ（最後の指示・AI の最後の返答・最後のツール）と送信待ちのすべてを開いて見られ、
 * 送る / 続けてから送る（作業の途中で止まったチャットだけ）/ 止めておく / あとで を選ぶ。「チャットで見て決める」でそのチャットを開いて閉じる
 * （そのチャットの送信待ちの上の帯で決められる）。「あとで決める」・Esc は何も送らずに閉じる（決めていないものはそのまま残る）
 */
function QueueResumeDialog({ resumes, onClose }: { resumes: QueueResume[]; onClose: () => void }) {
  // 選んでいる途中で、背景を押して閉じない
  const dialog = useModalDialog({ closeOnBackdrop: false, focusSelf: true });
  const [choices, setChoices] = useState<Record<number, QueueResumeChoice>>({});
  const [opened, setOpened] = useState<Record<number, boolean>>({});
  const action = useAction();
  const choiceOf = (r: QueueResume) => choices[r.chat_id] ?? defaultResumeChoice(r);
  const decided = resumes.filter((r) => choiceOf(r) !== "later");

  const decide = async () => {
    const ok = await action.run("decide", async () => {
      queueResumesStore.set(
        await api.resolveQueueResumes(decided.map((r) => ({ chat_id: r.chat_id, action: choiceOf(r) as QueueResumeAction }))),
      );
    });
    if (ok) dialog.close();
  };

  return (
    <dialog ref={dialog.ref} className="dialog app-dialog queue-resume-dialog" aria-label="送信待ちが残っています" onClose={onClose}>
      <form
        className="app-dialog-body"
        onSubmit={(e) => {
          e.preventDefault();
          void decide();
        }}
      >
        <div className="queue-resume-intro">
          <h2 className="app-dialog-title">送信待ちが残っています</h2>
          <p className="app-dialog-message">
            前回アプリを終えたとき、自動で送る送信待ちが残っていたチャットです。決めるまでは送りません。中身を見て、チャットごとに選んでください。
          </p>
        </div>
        <ul className="queue-resume-list">
          {resumes.map((r) => (
            <QueueResumeCard
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
        <DialogActions className="app-dialog-actions queue-resume-actions">
          <span className="queue-resume-summary muted small">{summaryOf(resumes.map(choiceOf))}</span>
          <button type="button" className="btn" disabled={action.busy !== null} onClick={() => dialog.close()} title="何も送らずに閉じます。下の帯の「決めていない送信待ち」から、また開けます">
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

/** 選んだ答えの内訳（「送る 1 · 止めておく 1 · あとで 1」） */
function summaryOf(choices: QueueResumeChoice[]): string {
  const order: QueueResumeChoice[] = ["send", "continue", "pause", "later"];
  return order
    .map((c) => [c, choices.filter((x) => x === c).length] as const)
    .filter(([, n]) => n > 0)
    .map(([c, n]) => `${CHOICE_LABELS[c]} ${n}`)
    .join(" · ");
}

/** 1 つのチャットのカード: 見出し（プロジェクト・名前・止まった時刻・途中で止まったか）・送信待ちの 1 行・詳しく見る・選ぶ切り替え・チャットで見て決める */
function QueueResumeCard({
  resume: r,
  choice,
  open,
  onToggle,
  onChoose,
  onOpenChat,
}: {
  resume: QueueResume;
  choice: QueueResumeChoice;
  open: boolean;
  onToggle: () => void;
  onChoose: (choice: QueueResumeChoice) => void;
  onOpenChat: () => void;
}) {
  const { projectsById } = useProjects();
  const project = projectsById.get(r.project_id);
  const title = chatTitle(r.title);
  const options = (["send", "continue", "pause", "later"] as const).filter((c) => c !== "continue" || r.interrupted);
  return (
    <li className={cx("queue-resume-row", choice === "later" && "later")}>
      <div className="queue-resume-head">
        {project && <ProjectMark project={project} />}
        <span className="queue-resume-title" title={project ? `${project.name} / ${title}` : title}>
          {title}
        </span>
        {r.stopped_at && <span className="queue-resume-time muted small">{formatMessageTime(r.stopped_at)} に停止</span>}
        <button
          type="button"
          className="link-button small queue-resume-open"
          onClick={onOpenChat}
          title="このチャットを開いて、会話を見ながら送信待ちを直してから決めます（送信待ちの上の帯で決められます）。ほかのチャットの選択は送らずに閉じます"
        >
          チャットで見て決める <ArrowUpRight size={12} aria-hidden />
        </button>
      </div>
      {r.interrupted && <div className="queue-resume-note small">アプリの終了で、作業の途中で止まりました</div>}
      <button type="button" className="queue-resume-toggle" aria-expanded={open} onClick={onToggle}>
        <ChevronRight size={13} className="queue-resume-chevron" aria-hidden />
        <span className="queue-resume-count">送信待ち {r.messages.length} 件</span>
        {!open && <span className="queue-resume-next">次: {nextQueuedText(r.messages[0])}</span>}
        <span className="queue-resume-toggle-label muted small">{open ? "閉じる" : "詳しく見る"}</span>
      </button>
      {open && <QueueResumeDetails resume={r} />}
      <div className="queue-resume-foot">
        <Segmented<QueueResumeChoice>
          className="segmented queue-resume-choice"
          label={`${title} の送信待ちをどうするか`}
          value={choice}
          options={options.map((c) => ({ value: c, label: CHOICE_LABELS[c], tip: QUEUE_RESUME_TIPS[c] }))}
          onChange={onChoose}
        />
      </div>
    </li>
  );
}

/** 詳しく見る: 止まったところ（最後の指示・AI の最後の返答・最後のツール）と、送信待ちのすべて（一時停止の線も同じ並びで） */
function QueueResumeDetails({ resume: r }: { resume: QueueResume }) {
  const moments = [
    { label: "最後の指示", moment: r.last_prompt, className: "prompt" },
    { label: "AI の最後の返答", moment: r.last_reply, className: "reply" },
    { label: "最後のツール", moment: r.last_tool, className: "tool" },
  ].filter((m) => m.moment !== null);
  const stopLine = (key: string) => (
    <li key={key} className="queue-resume-stop small">
      <OctagonPause size={12} aria-hidden /> 一時停止
    </li>
  );
  return (
    <div className="queue-resume-details">
      {moments.length > 0 && (
        <section className="queue-resume-section">
          <h3 className="queue-resume-section-title">止まったところ</h3>
          <dl className="queue-resume-moments">
            {moments.map(({ label, moment, className }) => (
              <Fragment key={label}>
                <dt className="muted small">
                  {label}
                  <span className="queue-resume-moment-time"> {formatMessageTime(moment!.at)}</span>
                </dt>
                <dd className={cx("queue-resume-moment", className)}>{moment!.text}</dd>
              </Fragment>
            ))}
          </dl>
        </section>
      )}
      <section className="queue-resume-section">
        <h3 className="queue-resume-section-title">送信待ち {r.messages.length} 件</h3>
        <ol className="queue-resume-queue">
          {r.messages.map((m, i) => (
            <Fragment key={m.id}>
              {r.stops.filter((k) => k === i).map((_, n) => stopLine(`stop-${i}-${n}`))}
              <li className="queue-resume-item">
                <span className="queue-resume-index muted small">{i + 1}</span>
                <span className={cx("queue-resume-item-text", queueActionOf(m) && "action")}>{queueActionOf(m) ? nextQueuedText(m) : m.text.trim() || nextQueuedText(m)}</span>
                {m.attachments.length > 0 && <span className="muted small">添付 {m.attachments.length}</span>}
              </li>
            </Fragment>
          ))}
          {r.stops.filter((k) => k === r.messages.length).map((_, n) => stopLine(`stop-end-${n}`))}
        </ol>
      </section>
    </div>
  );
}

/** 下の帯の入口: 決めていない送信待ちがある間だけ出し、押すと確かめのダイアログを開き直す */
export function QueueResumeFooterButton() {
  const resumes = useQueueResumes();
  if (resumes.length === 0) return null;
  return (
    <button
      type="button"
      className="footer-button queue-resume-footer"
      title="前回の終了で、自動で送るまま残った送信待ちです。決めるまで送りません。押すと、中身を見て決めるダイアログを開きます"
      onClick={openQueueResumes}
    >
      <History size={13} aria-hidden /> 決めていない送信待ち {resumes.length} 件
    </button>
  );
}
