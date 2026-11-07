import { useEffect, useRef, useState } from "react";
import { QUEUE_RESUME_ACTION_LABELS, type QueueResume, type QueueResumeAction } from "@shared/types";
import { api } from "@/api";
import { useModalDialog } from "@/hooks/useModalDialog";
import { useAction } from "@/hooks/useAction";
import { useProjects } from "@/stores/projects";
import { DialogActions } from "@/ui/DialogActions";
import { ErrorText } from "@/ui/ErrorText";
import { Segmented } from "@/ui/Segmented";
import { chatTitle } from "@/features/chat/chatTitle";
import { ProjectMark } from "@/features/project/ProjectMark";

/** 選んでいないときの答え: 作業の途中で止まったチャットは続けてから送る、ほかは送る */
const defaultAction = (r: QueueResume): QueueResumeAction => (r.interrupted ? "continue" : "send");

/** 答えごとの説明（乗せたときの説明） */
const ACTION_TIPS: Record<QueueResumeAction, string> = {
  send: "送る（自動で送るのまま、送信待ちを先頭から送ります）",
  continue: "続けてから送る（アプリの終了で止まった作業を続けるよう頼み、その作業が終わってから送信待ちを送ります）",
  pause: "止めておく（送信待ちは残したまま「止めています」にします。あとから「自動で送る」・行の「すぐ送る」で送れます）",
};

/**
 * 起動したときの送信待ちの確かめ（アプリを開いたときに 1 回。メインウィンドウだけ）: 前回の終了で、自動で送るまま送信待ちが残ったチャットを並べ、
 * チャットごとに 送る / 続けてから送る（作業の途中で止まったチャットだけ）/ 止めておく を選んでもらう（答えるまでコアは送らない）。
 * Esc・閉じるは、すべて止めておく（勝手に送らない）
 */
export function QueueResumeHost() {
  const [resumes, setResumes] = useState<QueueResume[]>([]);
  useEffect(() => {
    // 読めなければ出さない（送信待ちは送らずに残っているので、チャットの画面からいつでも送れる）
    api.queueResumes().then(setResumes, () => {});
  }, []);
  if (resumes.length === 0) return null;
  return <QueueResumeDialog resumes={resumes} onDone={() => setResumes([])} />;
}

function QueueResumeDialog({ resumes, onDone }: { resumes: QueueResume[]; onDone: () => void }) {
  // 選び終えるまで、背景を押して閉じない
  const dialog = useModalDialog({ closeOnBackdrop: false, focusSelf: true });
  const [choices, setChoices] = useState<Record<number, QueueResumeAction>>(() => Object.fromEntries(resumes.map((r) => [r.chat_id, defaultAction(r)])));
  const action = useAction();
  const answered = useRef(false);
  const { projectsById } = useProjects();

  const answer = async (pick: (r: QueueResume) => QueueResumeAction) => {
    answered.current = true;
    const ok = await action.run("answer", () => api.resolveQueueResumes(resumes.map((r) => ({ chat_id: r.chat_id, action: pick(r) }))));
    if (!ok) {
      answered.current = false;
      return;
    }
    dialog.close();
  };

  return (
    <dialog
      ref={dialog.ref}
      className="dialog app-dialog queue-resume-dialog"
      aria-label="送信待ちが残っています"
      onClose={() => {
        // Esc・閉じる: すべて止めておく（答えずに閉じても、勝手に送らない）
        if (!answered.current) void api.resolveQueueResumes(resumes.map((r) => ({ chat_id: r.chat_id, action: "pause" }))).catch(() => {});
        onDone();
      }}
    >
      <form
        className="app-dialog-body"
        onSubmit={(e) => {
          e.preventDefault();
          void answer((r) => choices[r.chat_id] ?? defaultAction(r));
        }}
      >
        <h2 className="app-dialog-title">送信待ちが残っています</h2>
        <p className="app-dialog-message">前回アプリを終えたとき、自動で送る送信待ちが残っていたチャットがあります。チャットごとに、このまま送るかを選んでください。止めておいたものは、あとから送信待ちの「自動で送る」・行の「すぐ送る」で送れます。</p>
        <ul className="queue-resume-list">
          {resumes.map((r) => {
            const project = projectsById.get(r.project_id);
            const options = (["send", "continue", "pause"] as const).filter((a) => a !== "continue" || r.interrupted);
            return (
              <li key={r.chat_id} className="queue-resume-row">
                <div className="queue-resume-head">
                  {project && <ProjectMark project={project} />}
                  <span className="queue-resume-title">{chatTitle(r.title)}</span>
                  <span className="queue-resume-count muted small">送信待ち {r.count} 件</span>
                </div>
                <div className="queue-resume-next muted small" title={r.next}>
                  次に送る: {r.next}
                </div>
                {r.interrupted && <div className="queue-resume-note small">アプリの終了で、作業の途中で止まりました</div>}
                <Segmented<QueueResumeAction>
                  className="segmented queue-resume-choice"
                  label={`${chatTitle(r.title)} の送信待ちをどうするか`}
                  value={choices[r.chat_id] ?? defaultAction(r)}
                  options={options.map((a) => ({ value: a, label: QUEUE_RESUME_ACTION_LABELS[a], tip: ACTION_TIPS[a] }))}
                  onChange={(a) => setChoices((prev) => ({ ...prev, [r.chat_id]: a }))}
                />
              </li>
            );
          })}
        </ul>
        <ErrorText message={action.error} />
        <DialogActions className="app-dialog-actions" submit={{ label: "この内容で決める", busyLabel: "送っています…", busy: action.busy !== null }}>
          <button type="button" className="btn" disabled={action.busy !== null} onClick={() => void answer(() => "pause")}>
            すべて止めておく
          </button>
        </DialogActions>
      </form>
    </dialog>
  );
}
