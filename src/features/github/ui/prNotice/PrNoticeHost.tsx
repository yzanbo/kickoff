import { useEffect, useRef, useState } from "react";
import type { WorktreePrNotice } from "@shared/git/types";
import { useWindowEvent } from "@/foundation/ui/hooks/useWindowEvent";
import { useCell } from "@/foundation/ui/store";
import { PrNoticeDialog } from "./PrNoticeDialog";
import { noticeKey, prNoticeRequest, useWorktreePrNotices, worktreePrsStore } from "@/features/worktrees/ui";
import { worktreesApi } from "@/features/worktrees/ui";

/** GitHub に聞き直してもらう（コアが 30 秒以内の続けての頼みはまとめる。聞けなくても前の知らせのまま） */
const refreshNotices = () =>
  void worktreesApi
    .refreshWorktreePrs()
    .then((list) => worktreePrsStore.set(list))
    .catch(() => undefined);

/**
 * ワークツリーの PR の知らせ（メインウィンドウにだけ置く）。開いたとき・窓に戻ったときに GitHub に聞き直してもらい、
 * まだ確認を閉じていない知らせがあれば、1 つずつ確認を開く（閉じると DB に覚え、どの窓でも出し直さない。印から開き直せる = openPrNotice）
 */
export function PrNoticeHost() {
  const notices = useWorktreePrNotices();
  // 開いている確認の知らせ（片付けて一覧から消えても、閉じるまでは開いたときのものを出す）
  const [opened, setOpened] = useState<WorktreePrNotice | null>(null);
  // この窓で一度開いた知らせ（閉じたあと、DB に覚えるのが届く前に開き直さない）
  const shown = useRef(new Set<string>());
  const requested = useCell(prNoticeRequest);
  useEffect(refreshNotices, []);
  useWindowEvent("focus", refreshNotices);
  useEffect(() => {
    if (opened) return;
    const next = notices.find((n) => !n.dismissed && !shown.current.has(noticeKey(n)));
    if (!next) return;
    shown.current.add(noticeKey(next));
    setOpened(next);
  }, [notices, opened]);
  // 印から開き直す
  useEffect(() => {
    if (requested === null) return;
    prNoticeRequest.set(null);
    const notice = notices.find((n) => noticeKey(n) === requested);
    if (!notice) return;
    shown.current.add(requested);
    setOpened(notice);
  }, [requested, notices]);
  if (!opened) return null;
  const current = notices.find((n) => noticeKey(n) === noticeKey(opened));
  return <PrNoticeDialog key={noticeKey(opened)} notice={current ?? opened} gone={!current} onClose={() => setOpened(null)} />;
}
