import { ExternalLink, GitMerge, GitPullRequestClosed } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { WorktreePrNotice } from "@shared/types";
import { errorMessage } from "@shared/errors";
import { api } from "@/api";
import { useAction } from "@/hooks/useAction";
import { useAsync } from "@/hooks/useAsync";
import { useModalDialog } from "@/hooks/useModalDialog";
import { useWindowEvent } from "@/hooks/useWindowEvent";
import { useChatsWithChildren } from "@/stores/chats";
import { useProjects } from "@/stores/projects";
import { useWorktreePrNotices, worktreePrsStore } from "@/stores/worktreePrs";
import { useWorktreeEnv, worktreesStore } from "@/stores/worktrees";
import { alertDialog } from "@/ui/dialogs";
import { DialogActions } from "@/ui/DialogActions";
import { ErrorText } from "@/ui/ErrorText";
import { CheckField } from "@/ui/Field";
import { Segmented } from "@/ui/Segmented";
import { downVolumesCheck, dropConnectionsCheck } from "../worktreeEnvText";
import {
  PR_CHAT_ACTIONS,
  PR_CHAT_ACTION_LABELS,
  PR_WORKTREE_ACTIONS,
  PR_WORKTREE_ACTION_LABELS,
  defaultWorktreeAction,
  prNoticeTitle,
  prNoticeWarnings,
  rootChatIds,
  type PrChatAction,
  type PrWorktreeAction,
} from "./prNoticePlan";

/** 確認を開く知らせ（印から。detail は知らせのキー） */
const OPEN_PR_NOTICE_EVENT = "kickoff:open-pr-notice";

/** 知らせを見分けるキー（プロジェクト・ワークツリー・PR の番号） */
const noticeKey = (n: WorktreePrNotice) => `${n.project_id}:${n.worktree}:${n.pr.number}`;

/** 印から確認を開き直す */
export function openPrNotice(notice: WorktreePrNotice) {
  window.dispatchEvent(new CustomEvent(OPEN_PR_NOTICE_EVENT, { detail: noticeKey(notice) }));
}

/** GitHub に聞き直してもらう（コアが 30 秒以内の続けての頼みはまとめる。聞けなくても前の知らせのまま） */
const refreshNotices = () =>
  void api
    .refreshWorktreePrs()
    .then((list) => worktreePrsStore.set(list))
    .catch(() => undefined);

/**
 * ワークツリーの PR の知らせ（App がメインウィンドウにだけ置く）。開いたとき・窓に戻ったときに GitHub に聞き直してもらい、
 * まだ確認を閉じていない知らせがあれば、1 つずつ確認を開く（閉じると DB に覚え、どの窓でも出し直さない。印から開き直せる）
 */
export function PrNoticeHost() {
  const notices = useWorktreePrNotices();
  // 開いている確認の知らせ（片付けて一覧から消えても、閉じるまでは開いたときのものを出す）
  const [opened, setOpened] = useState<WorktreePrNotice | null>(null);
  // この窓で一度開いた知らせ（閉じたあと、DB に覚えるのが届く前に開き直さない）
  const shown = useRef(new Set<string>());
  useEffect(refreshNotices, []);
  useWindowEvent("focus", refreshNotices);
  useEffect(() => {
    if (opened) return;
    const next = notices.find((n) => !n.dismissed && !shown.current.has(noticeKey(n)));
    if (!next) return;
    shown.current.add(noticeKey(next));
    setOpened(next);
  }, [notices, opened]);
  useWindowEvent(OPEN_PR_NOTICE_EVENT, (e) => {
    const key = (e as CustomEvent<string>).detail;
    const notice = notices.find((n) => noticeKey(n) === key);
    if (!notice) return;
    shown.current.add(key);
    setOpened(notice);
  });
  if (!opened) return null;
  const current = notices.find((n) => noticeKey(n) === noticeKey(opened));
  return <PrNoticeDialog key={noticeKey(opened)} notice={current ?? opened} gone={!current} onClose={() => setOpened(null)} />;
}

/**
 * 確認「PR #12 がマージされました」: ワークツリー（ブランチも消す / ワークツリーだけ消す / 残す）と、
 * そのワークツリーのチャット（子チャットも。アーカイブ / 削除 / そのまま）の扱いを 1 つで選ぶ。
 * 作業中のチャット・コミットしていない変更・プッシュしていないコミット・このブランチにしかないコミットは、確認の中で知らせる
 * （作業中のチャットがあれば、消す・アーカイブはできない）。マージされたときは、片付けたあと本体を最新にする（プル）
 */
function PrNoticeDialog({ notice, gone, onClose }: { notice: WorktreePrNotice; gone: boolean; onClose: () => void }) {
  const dialog = useModalDialog({ closeOnBackdrop: false, focusSelf: true });
  const projectId = notice.project_id;
  const { projectName } = useProjects();
  const chats = useChatsWithChildren().filter((c) => c.project_id === projectId && c.worktree_path === notice.worktree);
  const running = chats.filter((c) => c.status === "running").length;
  const info = useAsync(() => api.worktreeRemovalInfo(projectId, notice.worktree).catch(() => undefined), [projectId, notice.worktree]);
  const [worktreeAction, setWorktreeAction] = useState<PrWorktreeAction>(defaultWorktreeAction(notice));
  const [chatAction, setChatAction] = useState<PrChatAction>("archive");
  // Kickoff が組の名前を割り当てたワークツリーなら、コンテナとデータも消すか（初めは消す）
  const volumes = downVolumesCheck(useWorktreeEnv(projectId, notice.worktree));
  const [downVolumes, setDownVolumes] = useState(true);
  // このワークツリーの DB から作った DB クライアントの接続も消すか（初めは消す）
  const connections = dropConnectionsCheck(info.data?.db_connections ?? []);
  const [dropConnections, setDropConnections] = useState(true);
  const action = useAction();
  const effectiveChatAction = chats.length > 0 ? chatAction : "keep";
  const warnings = prNoticeWarnings(info.data, running, worktreeAction, effectiveChatAction);
  const nothing = worktreeAction === "keep" && effectiveChatAction === "keep";
  const blocked = running > 0 && !nothing;
  const merged = notice.pr.state === "MERGED";
  const Icon = merged ? GitMerge : GitPullRequestClosed;

  // ほかの窓などで片付いて知らせが消えたら閉じる（自分で片付けている途中は、終わってから閉じる）
  useEffect(() => {
    if (gone && action.busy === null) dialog.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gone, action.busy]);

  const submit = async () => {
    // 片付けるとチャットの作業場所が本体に戻り、ここでの一覧から外れるので、先に覚えておく
    const ids = effectiveChatAction === "keep" ? [] : rootChatIds(chats);
    let pullError: string | null = null;
    const ok = await action.run("submit", async () => {
      if (worktreeAction !== "keep") {
        // コミットしていない変更は、確認の中で知らせたうえで消すので force で消す
        const list = await api.removeWorktree(projectId, notice.worktree, {
          force: (info.data?.changes ?? 0) > 0,
          deleteBranch: worktreeAction === "both",
          downVolumes: volumes !== null && downVolumes,
          dropDbConnections: connections !== null && dropConnections,
        });
        worktreesStore.set(projectId, list);
        worktreesStore.invalidate(projectId);
        // マージされたなら本体を最新にする（手元に変更があってできなければ、あとで伝える）
        if (merged) await api.gitPull(projectId).catch((e: unknown) => (pullError = errorMessage(e)));
      }
      for (const id of ids) await (effectiveChatAction === "delete" ? api.deleteChat(id) : api.archiveChat(id));
    });
    if (!ok) return;
    dialog.close();
    if (pullError) void alertDialog("本体を最新にできませんでした", pullError);
  };

  return (
    <dialog
      ref={dialog.ref}
      className="dialog app-dialog pr-notice-dialog"
      aria-label={prNoticeTitle(notice)}
      onClose={() => {
        // 片付けずに閉じたら、同じ PR では確認を出し直さない（印から開き直せる。片付けて知らせが消えていれば何もしない）
        if (!notice.dismissed && !gone) void api.dismissWorktreePr(projectId, notice.pr.number).catch(() => undefined);
        onClose();
      }}
    >
      <form
        className="app-dialog-body"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h2 className={`app-dialog-title pr-notice-title ${merged ? "merged" : "closed"}`}>
          <Icon size={16} aria-hidden /> {prNoticeTitle(notice)}
        </h2>
        <p className="app-dialog-message">
          {projectName(projectId)} のワークツリー「{notice.branch}」の PR です。
          {merged ? "ワークツリーを片付けて、本体を最新にできます。" : "マージされていないので、作業を失わないよう、初めはブランチを残します。"}
        </p>
        <button type="button" className="link-button pr-notice-link" onClick={() => window.open(notice.pr.url)} title={notice.pr.url}>
          <span className="pr-notice-link-title">
            #{notice.pr.number} {notice.pr.title}
          </span>
          <ExternalLink size={12} aria-hidden />
        </button>
        <section className="pr-notice-section">
          <h3 className="pr-notice-label">ワークツリー</h3>
          <Segmented<PrWorktreeAction>
            className="segmented pr-notice-choice"
            label="ワークツリーをどうするか"
            value={worktreeAction}
            options={PR_WORKTREE_ACTIONS.map((a) => ({ value: a, label: PR_WORKTREE_ACTION_LABELS[a] }))}
            onChange={setWorktreeAction}
          />
          <p className="muted small pr-notice-path" title={notice.worktree}>
            {notice.worktree}
          </p>
          {volumes && worktreeAction !== "keep" && <CheckField label={volumes.label} help={volumes.help(downVolumes)} checked={downVolumes} onChange={setDownVolumes} />}
          {connections && worktreeAction !== "keep" && (
            <CheckField label={connections.label} help={connections.help(dropConnections)} checked={dropConnections} onChange={setDropConnections} />
          )}
        </section>
        {chats.length > 0 && (
          <section className="pr-notice-section">
            <h3 className="pr-notice-label">このワークツリーのチャット {chats.length} 件（子チャットも）</h3>
            <Segmented<PrChatAction>
              className="segmented pr-notice-choice"
              label="このワークツリーのチャットをどうするか"
              value={chatAction}
              options={PR_CHAT_ACTIONS.map((a) => ({ value: a, label: PR_CHAT_ACTION_LABELS[a] }))}
              onChange={setChatAction}
            />
            {worktreeAction !== "keep" && effectiveChatAction === "keep" && <p className="muted small">そのままにしたチャットは、続きを本体で進めます。</p>}
          </section>
        )}
        {warnings.length > 0 && (
          <ul className="pr-notice-warnings">
            {warnings.map((w) => (
              <li key={w} className="warn-text small">
                {w}
              </li>
            ))}
          </ul>
        )}
        <ErrorText message={action.error} />
        <DialogActions className="app-dialog-actions">
          <button type="button" className="btn" disabled={action.busy !== null} onClick={() => dialog.close()} title="何もせずに閉じます。印から、また開けます">
            あとで
          </button>
          <button type="submit" className="btn btn-primary" disabled={action.busy !== null || blocked || info.loading}>
            {action.busy ? "片付けています…" : nothing ? "このままにする" : "この内容で片付ける"}
          </button>
        </DialogActions>
      </form>
    </dialog>
  );
}
