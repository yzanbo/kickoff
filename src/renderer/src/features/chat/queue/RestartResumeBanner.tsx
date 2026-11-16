import { History } from "lucide-react";
import type { RestartResumeAction, RestartResumeState } from "@shared/types";
import { api } from "@/api";
import { useAction } from "@/hooks/useAction";
import { cx } from "@/lib/cx";
import { restartResumesStore } from "@/stores/restartResumes";
import { ErrorText } from "@/ui/ErrorText";
import { defaultResumeChoice, resumeActionsFor, resumeChoiceLabel, resumeChoiceTip } from "./restartResumeChoices";

/**
 * 起動したときの再開の確かめを待っている間の帯と、その場で決めるボタン。送信待ちがあれば送信待ちの上（決めるまで送らない。
 * 会話を見ながら、送信待ちを直す・消す・並べ替えてから決められる）、なければ入力欄の上（standalone。作業の途中で止まったことと、続けるか）
 */
export function RestartResumeBanner({ chatId, resume, standalone = false }: { chatId: number; resume: RestartResumeState; standalone?: boolean }) {
  const action = useAction<RestartResumeAction>();
  const answer = (a: RestartResumeAction) =>
    void action.run(a, async () => restartResumesStore.set(await api.resolveRestartResumes([{ chat_id: chatId, action: a }])));
  const primary = defaultResumeChoice(resume);
  return (
    <div className={cx("queue-resume-banner", standalone && "standalone")} role="status">
      <History size={14} className="queue-resume-banner-icon" aria-hidden />
      <span className="queue-resume-banner-text">
        {resume.queued ? (
          <>
            前回の終了で残った送信待ちです。決めるまで送りません。
            {resume.interrupted && <span className="queue-resume-banner-note">アプリの終了で、作業の途中で止まりました。</span>}
          </>
        ) : (
          "前回の終了で、作業の途中で止まりました。"
        )}
      </span>
      <span className="queue-resume-banner-actions">
        {resumeActionsFor(resume).map((a) => (
          <button
            key={a}
            type="button"
            className={cx("btn btn-sm", a === primary && "btn-primary")}
            disabled={action.busy !== null}
            title={resumeChoiceTip(a, resume.queued)}
            onClick={() => answer(a)}
          >
            {resumeChoiceLabel(a, resume.queued)}
          </button>
        ))}
      </span>
      <ErrorText message={action.error} />
    </div>
  );
}
