import type { HTMLAttributes } from "react";
import type { Chat } from "@shared/types";
import { cx } from "@/lib/cx";
import { CHAT_TITLE_MAX } from "@/features/chat/chatTitle";
import { knownChat } from "@/stores/chats";
import { confirmLeaveMemo } from "@/features/memo/memoGuards";
import { closeChatWithChoice } from "@/features/chat/closeChat";
import { StatusSlot } from "@/features/chat/StatusSlot";
import type { useChatRename } from "@/features/chat/useChatRename";
import type { PanelController } from "@/features/panel/usePanel";
import { SURFACES } from "@/features/panel/surfaces";
import { PanelTab } from "./PanelTab";
import { TabWorkplaceBadge } from "./TabWorkplaceBadge";
import type { PanelTab as Tab } from "./panelTypes";
import { specOf, type TabGroupLookup } from "./tabKinds";
import { useChatTabHint } from "./useChatTabHint";
import { useTabAgentState } from "./useTabAgentState";

/**
 * ペインのタブの列のタブ 1 つ。アイコン・名前・説明・グループ名は種類の表（tabKinds）から引き、チャット・子チャット・サブエージェントのタブは
 * サイドバーの行と同じ状態の印を出す（useTabAgentState。未読・失敗のタブは名前も太字。ピン留めしたチャットはいちばん左にピン）。チャットのタブは名前のダブルクリックでその場で名前を変え（見出しには名前を出さない）、
 * × は表示だけ消す・アーカイブ・削除を選んでから閉じる（ほかのタブはそのまま閉じる）。分けたペイン（home でない）のサイドバーと連動したチャットは、
 * × で聞かずに一覧のペインへ戻す（ペインを閉じたときと同じ。アーカイブ・削除は右クリックから）
 */
export function PaneTab({
  panel,
  tab: t,
  active,
  home,
  badgeOf,
  groupOf,
  className,
  extra,
  rename,
}: {
  panel: PanelController;
  tab: Tab;
  active: boolean;
  /** 一覧のペインのタブか */
  home: boolean;
  /**
   * 名前の後ろに添える札: グループ（まとめない・作業場所別）/ 作業場所（グループ別。グループはまとまりの頭に出るので、代わりにどの作業場所かを添える。
   * チャット・新しいチャットのタブだけ）
   */
  badgeOf: "group" | "workplace";
  /** プロジェクトのグループ（名前と色）を引く */
  groupOf: TabGroupLookup;
  /** ドラッグで落とす位置の印など */
  className?: string;
  /** ドラッグ・右クリックのメニュー */
  extra: HTMLAttributes<HTMLDivElement>;
  /** チャットのタブの名前をその場で変える（パネル全体で 1 つ） */
  rename: ReturnType<typeof useChatRename>;
}) {
  const spec = specOf(t);
  // チャットのタブのチャット（ボードの一覧になければ、タブの中のチャットから届いたもの）と、エージェントの状態（チャット・子チャット・サブエージェント）
  const chat = panel.chatOf(t);
  const agent = useTabAgentState(panel, t);
  const label = spec.label(t, chat);
  const group = spec.group?.(t, chat, groupOf);
  const chatHint = useChatTabHint(t.kind === "chat" ? chat : undefined, label, group?.name);
  const backHome = !home && panel.isLinkedTab(t.key);
  const close = () => {
    if (backHome) return panel.returnToHome(t.key);
    // 子チャットのタブは、チャットの ✕ と同じく閉じ方を聞く（表示だけ消す = タブを閉じる。子チャットは残る）
    if (t.kind === "child") return void closeChatWithChoice({ id: t.childId, title: t.title, archived_at: knownChat(t.childId)?.archived_at }, () => panel.closeTab(t.key));
    // メモのタブは、まだ保存していない書きかけがあれば保存するかを聞く
    if (t.kind === "memo") return void confirmLeaveMemo(t.projectId, t.path).then((ok) => ok && panel.closeTab(t.key));
    if (t.kind !== "chat") return panel.closeTab(t.key);
    void closeChatWithChoice({ id: t.id, title: t.title ?? "", archived_at: chat?.archived_at }, (action) => panel.closeTab(t.key, { dismiss: action === "close" }));
  };
  const editor = t.kind === "chat" ? rename.editorFor({ id: t.id } as Chat) : undefined;
  // 作業場所の札（チャットはそのチャットの作業場所、新しいチャットは始める作業場所。ほかの種類は添えない）
  const place =
    t.kind === "chat" ? chat : t.kind === "new" ? { project_id: t.projectId, worktree_path: t.worktree ?? null, branch: null } : undefined;
  const workplaceTag = badgeOf === "workplace" && place ? <TabWorkplaceBadge chat={place} /> : undefined;
  return (
    <PanelTab
      active={active}
      icon={spec.icon}
      iconClass={spec.iconClass}
      badge={spec.badge && !SURFACES[panel.surface].noKindBadges ? { text: spec.BadgeText ? <spec.BadgeText tab={t} /> : spec.badge, kind: t.kind } : undefined}
      label={label}
      group={badgeOf === "group" ? group : undefined}
      tag={badgeOf === "workplace" ? workplaceTag : undefined}
      title={spec.hint?.(t) ?? chatHint ?? (group ? `${label}（グループ: ${group.name}）` : label)}
      className={cx(className, agent && (agent.state === "unread" || agent.state === "failed" || agent.unread) && "unread")}
      extra={extra}
      onSelect={() => panel.showTab(t.key)}
      pinnedIn={chat?.pinned ? chat.project_id : null}
      lead={spec.Lead ? <spec.Lead tab={t} /> : agent && <StatusSlot state={agent.state} unread={agent.unread} label={agent.label} />}
      onRename={t.kind === "chat" ? () => rename.start({ id: t.id } as Chat) : undefined}
      // 名前を変えている途中なら、タブの入力欄に渡す形にする（初めの値はタブの名前）
      editor={editor && t.kind === "chat" ? { ...editor, initial: t.title ?? "", maxLength: CHAT_TITLE_MAX } : undefined}
      closeLabel={backHome ? `${label} を一覧のペインに戻す` : undefined}
      onClose={close}
    />
  );
}
