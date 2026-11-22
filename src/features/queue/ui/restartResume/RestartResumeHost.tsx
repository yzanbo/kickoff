import { useEffect, useRef } from "react";
import { autoOpenRestartResumes, restartResumeDialog, useRestartResumes } from "./restartResumes";
import { RestartResumeDialog } from "./RestartResumeDialog";

/**
 * 起動したときの再開の確かめ（App がメインウィンドウにだけ置く）。前回の終了で、作業の途中で止まった・自動で送るまま送信待ちが残ったチャットがあれば、
 * ダイアログを出す（まだ見せていないチャットが届いたときだけ。コアのプロセスを作り直したあとに新しく止まったチャットでも開く）。
 * 閉じても決めていないものは残り（コアは続けず・送らない）、下の帯の「決めていない再開」から開き直せる（開いているかは店 restartResumeDialog）
 */
export function RestartResumeHost() {
  const resumes = useRestartResumes();
  const open = restartResumeDialog.useOpen();
  // 前に見せた一覧のチャット（見せたものは、閉じたあとは下の帯から開き直す）
  const shown = useRef<ReadonlySet<number>>(new Set());
  useEffect(() => {
    const next = autoOpenRestartResumes(shown.current, resumes);
    shown.current = next.shown;
    if (next.open) restartResumeDialog.open();
  }, [resumes]);
  if (!open || resumes.length === 0) return null;
  return <RestartResumeDialog resumes={resumes} onClose={restartResumeDialog.close} />;
}
