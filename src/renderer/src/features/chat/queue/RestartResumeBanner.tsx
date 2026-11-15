import { History } from "lucide-react";
import { RESTART_RESUME_ACTION_LABELS, type ChatLive, type RestartResumeAction } from "@shared/types";
import { api } from "@/api";
import { useAction } from "@/hooks/useAction";
import { cx } from "@/lib/cx";
import { restartResumesStore } from "@/stores/restartResumes";
import { ErrorText } from "@/ui/ErrorText";
import { RESTART_RESUME_TIPS } from "./restartResumeChoices";

/**
 * 送信待ちの上の帯（起動したときの送信待ちの確かめを待っている間）: 前回の終了で残った送信待ちで、決めるまで送らないことと、その場で決めるボタン。
 * 会話を見ながら、送信待ちを直す・消す・並べ替えてから決められる（その間もコアは送らない）
 */
export function RestartResumeBanner({ chatId, resume }: { chatId: number; resume: NonNullable<ChatLive["restart_resume"]> }) {
  const action = useAction<RestartResumeAction>();
  const answer = (a: RestartResumeAction) =>
    void action.run(a, async () => restartResumesStore.set(await api.resolveRestartResumes([{ chat_id: chatId, action: a }])));
  const actions = (["send", "continue", "pause"] as const).filter((a) => a !== "continue" || resume.interrupted);
  return (
    <div className="queue-resume-banner" role="status">
      <History size={14} className="queue-resume-banner-icon" aria-hidden />
      <span className="queue-resume-banner-text">
        前回の終了で残った送信待ちです。決めるまで送りません。
        {resume.interrupted && <span className="queue-resume-banner-note">アプリの終了で、作業の途中で止まりました。</span>}
      </span>
      <span className="queue-resume-banner-actions">
        {actions.map((a) => (
          <button
            key={a}
            type="button"
            className={cx("btn btn-sm", a === (resume.interrupted ? "continue" : "send") && "btn-primary")}
            disabled={action.busy !== null}
            title={RESTART_RESUME_TIPS[a]}
            onClick={() => answer(a)}
          >
            {RESTART_RESUME_ACTION_LABELS[a]}
          </button>
        ))}
      </span>
      <ErrorText message={action.error} />
    </div>
  );
}
