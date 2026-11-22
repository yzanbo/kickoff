import { History } from "lucide-react";
import { restartResumeDialog, useRestartResumes } from "./restartResumes";

/** 下の帯の入口: 決めていない再開がある間だけ出し、押すと確かめのダイアログを開き直す */
export function RestartResumeFooterButton() {
  const resumes = useRestartResumes();
  if (resumes.length === 0) return null;
  return (
    <button
      type="button"
      className="footer-button restart-resume-footer"
      title="前回の終了で、作業の途中で止まった・自動で送るまま送信待ちが残ったチャットです。決めるまで続けず、送りません。押すと、中身を見て決めるダイアログを開きます"
      onClick={restartResumeDialog.open}
    >
      <History size={13} aria-hidden /> 決めていない再開 {resumes.length} 件
    </button>
  );
}
