import { Columns2, Globe, Rows2, SquarePen, SquareTerminal, X } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "../../cx";
import { IconButton } from "../IconButton";
import { PanelTab } from "./PanelTab";
import type { PaneLeaf, SplitDir } from "./paneLayout";
import { tabLabel } from "./panelTabs";
import { closeChatWithChoice } from "../chat/closeChat";
import { CHAT_TITLE_MAX } from "../../chatTitle";
import type { useRunRename } from "../../hooks/useRunRename";
import { useRunStates } from "../../approvalsContext";
import { StatusSlot } from "../StatusSlot";
import { busyWithUnread } from "../../../../core/board";
import type { Run } from "../../../../core/types";
import type { TabDrag } from "./useTabDrag";
import type { SidePanelController } from "./useSidePanel";

/**
 * 右のパネルの 1 つのペインのタブの列。左にパネルの閉じる・横幅いっぱい（controls。左上のペインだけ）、タブ、
 * 右端に新しいタブ（チャット・ブラウザ・ターミナル）と、右・下に分ける・ペインを閉じる（分けているときだけ）。
 * 押すとこのペインにピントを移す（新しく開くタブはここに入る）
 */
export function PaneTabBar({
  panel,
  pane,
  split,
  inert,
  controls,
  drag,
  terminals,
  terminalMenuOpen,
  onNewChat,
  onTerminal,
  onMenu,
  rename,
}: {
  panel: SidePanelController;
  pane: PaneLeaf;
  /** ペインを分けているか（ペインを閉じるボタンを出す） */
  split: boolean;
  inert?: boolean;
  controls?: ReactNode;
  drag: TabDrag;
  /** 開けるターミナルの場所の数（0 なら出さない） */
  terminals: number;
  terminalMenuOpen: boolean;
  onNewChat: () => void;
  onTerminal: (e: React.MouseEvent<HTMLButtonElement>, pane: PaneLeaf) => void;
  /** タブの右クリック */
  onMenu: (tabKey: string, e: React.MouseEvent) => void;
  /** チャットのタブの名前をその場で変える（ダブルクリック・右クリックの「名前を変更」。パネル全体で 1 つ） */
  rename: ReturnType<typeof useRunRename>;
}) {
  const insertAt = drag.insertAt(pane.id);
  /** 右・下に分ける: タブが 2 つ以上なら表示中のタブを新しいペインへ移し、1 つ以下なら空のペインを作る */
  const splitTo = (dir: SplitDir) => panel.splitPane(pane.id, dir, "after", pane.tabs.length > 1 ? (pane.active ?? undefined) : undefined);
  // チャットのタブの状態（作業中・回答待ち・未読・既読。サイドバーの行と同じ印）
  const { stateOf } = useRunStates();
  const chatRunOf = (t: { id: number; status?: Run["status"]; attention?: boolean }) =>
    panel.runs.find((r) => r.id === t.id) ?? (t.status ? ({ id: t.id, status: t.status, attention: Boolean(t.attention) } as Run) : undefined);
  return (
    <div
      className={cx("panel-tabs", insertAt !== null && pane.tabs.length === 0 && "split-insert-bar")}
      role="tablist"
      inert={inert}
      onPointerDown={() => panel.focusPane(pane.id)}
      {...drag.barProps(pane.id)}
    >
      {controls}
      {pane.tabs.map((key, i) => {
        const t = panel.tabs.find((x) => x.key === key);
        if (!t) return null;
        const { Icon, iconClass, label } = tabLabel(t, panel.runs);
        // チャットのタブの状態（未読・失敗のタブは名前も太字にする。サイドバーの行と同じ）
        const chatRun = t.kind === "chat" ? chatRunOf(t) : undefined;
        const chatState = chatRun && stateOf(chatRun);
        const busyUnread = Boolean(chatRun && chatState && busyWithUnread(chatRun, chatState));
        return (
          <PanelTab
            key={t.key}
            active={pane.active === t.key}
            icon={Icon}
            iconClass={iconClass}
            label={label}
            title={t.kind === "browser" ? t.url : t.kind === "terminal" ? t.cwd : label}
            className={cx(
              insertAt === i && "split-insert-before",
              insertAt === pane.tabs.length && i === pane.tabs.length - 1 && "split-insert-after",
              drag.dragging === t.key && "split-dragging",
              (chatState === "attention" || chatState === "failed" || busyUnread) && "unread",
            )}
            extra={{ ...drag.tabProps(t.key), onContextMenu: (e) => onMenu(t.key, e) }}
            onSelect={() => panel.showTab(t.key)}
            lead={chatState && <StatusSlot state={chatState} unread={busyUnread} />}
            // チャットのタブは、名前のダブルクリックでその場で名前を変える（見出しには名前を出さない）
            onRename={t.kind === "chat" ? () => rename.start({ id: t.id } as Run) : undefined}
            editor={t.kind === "chat" ? withInitial(rename.editorFor({ id: t.id } as Run), t.title ?? "") : undefined}
            // チャットのタブの ×: 表示だけ消す・アーカイブ・削除を選んでから閉じる（ほかのタブはそのまま閉じる）
            onClose={() =>
              t.kind === "chat" ? void closeChatWithChoice({ id: t.id, title: t.title ?? "" }, () => panel.closeTab(t.key)) : panel.closeTab(t.key)
            }
          />
        );
      })}
      {/* 新しいタブ: チャット・ブラウザ・ターミナルを 1 回で開く。続けて、ペインを分ける・閉じる */}
      <span className="panel-tab-adds">
        <IconButton icon={SquarePen} label="新しいチャット" size={14} onClick={onNewChat} />
        <IconButton icon={Globe} label="ブラウザを開く" size={14} onClick={() => panel.openBrowser()} />
        {terminals > 0 && (
          <IconButton
            icon={SquareTerminal}
            label="ターミナルを開く"
            title="ターミナルを開く（チャットを表示しているときは、その作業場所で開く）"
            size={14}
            className="panel-tab-terminal"
            aria-haspopup={terminals > 1 ? "menu" : undefined}
            aria-expanded={terminals > 1 ? terminalMenuOpen : undefined}
            onClick={(e) => onTerminal(e, pane)}
          />
        )}
        <IconButton icon={Columns2} label="右に分ける" title="右に分ける（⌘\）" size={14} onClick={() => splitTo("row")} />
        <IconButton icon={Rows2} label="下に分ける" size={14} onClick={() => splitTo("column")} />
        {split && <IconButton icon={X} label="ペインを閉じる" title="ペインを閉じる（中のタブも閉じる）" size={15} onClick={() => panel.closePane(pane.id)} />}
      </span>
    </div>
  );
}

/** 名前を変えている途中なら、タブの入力欄に渡す形にする（初めの値はタブの名前） */
function withInitial(editor: { onSubmit: (name: string) => void; onCancel: () => void } | undefined, initial: string) {
  return editor && { ...editor, initial, maxLength: CHAT_TITLE_MAX };
}
