import type { HTMLAttributes } from "react";
import { cx } from "@/lib/cx";
import { knownChat, useKnownChat } from "@/stores/chats";
import { useFileTabDirty } from "@/features/editor/fileTabs";
import { closeChatWithChoice } from "@/features/chat/closeChat";
import { StatusSlot } from "@/features/chat/StatusSlot";
import { chatTitle } from "@/features/chat/chatTitle";
import type { PanelController } from "@/features/panel/usePanel";
import { SURFACES } from "@/features/panel/surfaces";
import { confirmCloseUnsaved } from "./confirmUnsaved";
import { PanelTab } from "./PanelTab";
import { TabWorkplaceBadge } from "./TabWorkplaceBadge";
import type { PanelTab as Tab } from "./panelTypes";
import { specOf, type TabGroupLookup } from "./tabKinds";
import type { TabRename } from "./useTabRename";
import { useChatTabHint } from "./useChatTabHint";
import { useTabAgentState } from "./useTabAgentState";
import type { TabField } from "./tabFields";

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
  show,
  twoLine,
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
   * タブに出す項目（状態の印・ピン・グループの札・作業場所の札。タブの列の「表示」のメニューの「タブに出す項目」で選んだもの。
   * グループ別ならグループ・作業場所別なら作業場所は、まとまりの札に出るので選んでいても出さない。tabFields.ts の tabFieldShown）
   */
  show: (field: TabField) => boolean;
  /** 2 行にする（名前の下にグループ・作業場所の札） */
  twoLine: boolean;
  /** プロジェクトのグループ（名前と色）を引く */
  groupOf: TabGroupLookup;
  /** ドラッグで落とす位置の印など */
  className?: string;
  /** ドラッグ・右クリックのメニュー */
  extra: HTMLAttributes<HTMLDivElement>;
  /** チャット・新しいチャットのタブの名前をその場で変える（パネル全体で 1 つ） */
  rename: TabRename;
}) {
  const spec = specOf(t);
  // チャットのタブのチャット（ボードの一覧になければ、タブの中のチャットから届いたもの）と、エージェントの状態（チャット・子チャット・サブエージェント）
  const chat = panel.chatOf(t);
  const agent = useTabAgentState(panel, t);
  // 子チャットのタブの名前は、いまの子チャットの名前（タブに覚えた名前は開いたときのもので、名前を変えると古いまま残った）
  const child = useKnownChat(t.kind === "child" ? t.childId : 0);
  const label = t.kind === "child" && child ? chatTitle(child.title) : spec.label(t, chat);
  const group = spec.group?.(t, chat, groupOf);
  const chatHint = useChatTabHint(t.kind === "chat" ? chat : undefined, label, group?.name);
  const backHome = !home && panel.isLinkedTab(t.key);
  // ファイルのタブは、保存していない変更があれば × の代わりに「●」（乗せると ×。VS Code と同じ）
  const dirty = useFileTabDirty(panel.key, t.kind === "projectFile" ? t.key : null);
  const close = () => {
    if (backHome) return panel.returnToHome(t.key);
    // 子チャットのタブは、チャットの ✕ と同じく閉じ方を聞く（表示だけ消す = タブを閉じる。子チャットは残る）
    if (t.kind === "child") return void closeChatWithChoice({ id: t.childId, title: t.title, archived_at: knownChat(t.childId)?.archived_at }, () => panel.closeTab(t.key));
    // メモ・ファイルのタブは、保存していない書きかけがあれば保存するかを聞く（confirmUnsaved.ts）
    if (t.kind !== "chat") return void confirmCloseUnsaved(panel.key, t).then((ok) => ok && panel.closeTab(t.key));
    void closeChatWithChoice({ id: t.id, title: t.title ?? "", archived_at: chat?.archived_at }, (action) => panel.closeTab(t.key, { dismiss: action === "close" }));
  };
  const editor = rename.editorFor(panel.key, t, child?.title);
  // 作業場所の札（チャットはそのチャットの作業場所、新しいチャットは始める作業場所。ほかの種類は添えない）
  const place =
    t.kind === "chat" ? chat : t.kind === "new" ? { project_id: t.projectId, worktree_path: t.worktree ?? null, branch: null } : undefined;
  const workplaceTag = show("worktree") && place ? <TabWorkplaceBadge chat={place} /> : undefined;
  return (
    <PanelTab
      active={active}
      icon={spec.icon}
      iconClass={spec.iconClass}
      badge={spec.badge && !SURFACES[panel.surface].noKindBadges ? { text: spec.BadgeText ? <spec.BadgeText tab={t} /> : spec.badge, kind: t.kind } : undefined}
      label={label}
      group={show("group") ? group : undefined}
      tag={workplaceTag}
      tagKey={workplaceTag && place ? `${place.worktree_path ?? ""}|${place.branch ?? ""}` : undefined}
      twoLine={twoLine}
      title={spec.hint?.(t) ?? chatHint ?? (group ? `${label}（グループ: ${group.name}）` : label)}
      className={cx(className, agent && (agent.state === "unread" || agent.state === "failed" || agent.unread) && "unread")}
      extra={extra}
      onSelect={() => panel.showTab(t.key)}
      pinnedIn={show("pin") && chat?.pinned ? chat.project_id : null}
      // 状態の印を隠したときは、ほかの種類のタブと同じくアイコンを出す（未読・失敗の太字はそのまま）
      lead={spec.Lead ? <spec.Lead tab={t} /> : agent && show("state") ? <StatusSlot state={agent.state} unread={agent.unread} label={agent.label} /> : undefined}
      onRename={rename.canRename(t) ? () => rename.start(t.key) : undefined}
      // 名前を変えている途中なら、タブの入力欄に渡す形にする（初めの値はタブの名前。新しいチャットは付けた名前）
      editor={editor}
      closeLabel={backHome ? `${label} を一覧のペインに戻す` : dirty ? `${label} のタブを閉じる（保存していない変更があります）` : undefined}
      dirty={dirty}
      onClose={close}
    />
  );
}
