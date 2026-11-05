import type { HTMLAttributes } from "react";
import type { Chat } from "@shared/types";
import { busyWithUnread } from "@shared/chat/state";
import { cx } from "@/lib/cx";
import { useChatStates } from "@/app/chatStatesContext";
import { CHAT_TITLE_MAX } from "@/features/chat/chatTitle";
import { closeChatWithChoice } from "@/features/chat/closeChat";
import { StatusSlot } from "@/features/chat/StatusSlot";
import type { useChatRename } from "@/features/chat/useChatRename";
import type { PanelController } from "@/features/panel/usePanel";
import { PanelTab } from "./PanelTab";
import type { PanelTab as Tab } from "./panelTypes";
import { specOf } from "./tabKinds";

/**
 * ペインのタブの列のタブ 1 つ。アイコン・名前・説明・グループ名は種類の表（tabKinds）から引き、チャットのタブはサイドバーの行と同じ状態の印を出す
 * （未読・失敗のタブは名前も太字）。チャットのタブは名前のダブルクリックでその場で名前を変え（見出しには名前を出さない）、
 * × は表示だけ消す・アーカイブ・削除を選んでから閉じる（ほかのタブはそのまま閉じる）。分けたペイン（home でない）のサイドバーと連動したチャットは、
 * × で聞かずに一覧のペインへ戻す（ペインを閉じたときと同じ。アーカイブ・削除は右クリックから）
 */
export function PaneTab({
  panel,
  tab: t,
  active,
  home,
  showGroup,
  groupName,
  className,
  extra,
  rename,
}: {
  panel: PanelController;
  tab: Tab;
  active: boolean;
  /** 一覧のペインのタブか */
  home: boolean;
  /** 名前の後ろにグループ名を添えるか（グループ別にまとめているときは、まとまりの頭に出るので添えない） */
  showGroup: boolean;
  /** プロジェクトのグループ名を引く */
  groupName: (projectId: number, groupId: number | null | undefined) => string | undefined;
  /** ドラッグで落とす位置の印など */
  className?: string;
  /** ドラッグ・右クリックのメニュー */
  extra: HTMLAttributes<HTMLDivElement>;
  /** チャットのタブの名前をその場で変える（パネル全体で 1 つ） */
  rename: ReturnType<typeof useChatRename>;
}) {
  const { stateOf } = useChatStates();
  const spec = specOf(t);
  // チャットのタブのチャット（ボードの一覧になければ、タブの中のチャットから届いたもの）と状態
  const chat = panel.chatOf(t);
  const state = chat && stateOf(chat);
  const busyUnread = Boolean(chat && state && busyWithUnread(chat, state));
  const label = spec.label(t, chat);
  const group = spec.groupName?.(t, chat, groupName);
  const backHome = !home && panel.isLinkedTab(t.key);
  const close = () => {
    if (backHome) return panel.returnToHome(t.key);
    if (t.kind !== "chat") return panel.closeTab(t.key);
    void closeChatWithChoice({ id: t.id, title: t.title ?? "", archived_at: chat?.archived_at }, (action) => panel.closeTab(t.key, { dismiss: action === "close" }));
  };
  const editor = t.kind === "chat" ? rename.editorFor({ id: t.id } as Chat) : undefined;
  return (
    <PanelTab
      active={active}
      icon={spec.icon}
      iconClass={spec.iconClass}
      label={label}
      group={showGroup ? group : undefined}
      title={spec.hint?.(t) ?? (group ? `${label}（グループ: ${group}）` : label)}
      className={cx(className, (state === "unread" || state === "failed" || busyUnread) && "unread")}
      extra={extra}
      onSelect={() => panel.showTab(t.key)}
      lead={spec.Lead ? <spec.Lead tab={t} /> : state && <StatusSlot state={state} unread={busyUnread} />}
      onRename={t.kind === "chat" ? () => rename.start({ id: t.id } as Chat) : undefined}
      // 名前を変えている途中なら、タブの入力欄に渡す形にする（初めの値はタブの名前）
      editor={editor && t.kind === "chat" ? { ...editor, initial: t.title ?? "", maxLength: CHAT_TITLE_MAX } : undefined}
      closeLabel={backHome ? `${label} を一覧のペインに戻す` : undefined}
      onClose={close}
    />
  );
}
