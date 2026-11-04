import { ChevronDown, Columns2, Globe, Rows2, SquarePen, SquareTerminal, X } from "lucide-react";
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
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
import { useGroupNames } from "../../groupNames";
import type { SidePanelController } from "./useSidePanel";
import { OTHER_CLUSTER, clusterHue, clusterTabs, paneIndexOf, type TabCluster } from "./tabClusters";
import { TabClusterHead } from "./TabClusterHead";
import { useTabClusters, useTabGrouping } from "./useTabClusters";

/** ▾ のメニューの種類 */
export type OpenWithKind = "browser" | "terminal";

/**
 * 右のパネルの 1 つのペインのタブの列。左にパネルの閉じる・横幅いっぱい（controls。左上のペインだけ）、タブ、
 * タブのすぐ右に新しいタブ（チャット・ブラウザ・ターミナル）、右端に右・下に分ける・ペインを閉じる（分けているときだけ）。
 * タブが多いときはタブの並びの中だけを横にスクロールし、新しいタブのボタンはいつもタブのすぐ右に見せる。
 * 押すとこのペインにピントを移す（新しく開くタブはここに入る）。
 * タブのまとめ方（useTabGrouping。グループ別・作業場所別）を選んでいるときは、まとまりごとに頭に名前を付けて並べる
 * （ブラウザのタブのグループと同じ。まとまりの中はペインの並びのまま。ドラッグで落とす位置は見た目の並びからペインの並びに直す）
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
  onBarMenu,
  onOpenWith,
  openWithShown,
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
  /** ブラウザ・ターミナルの ▾（新しいタブ・外のアプリで開く・外のアプリを選ぶメニュー） */
  onOpenWith: (kind: OpenWithKind, e: React.MouseEvent<HTMLButtonElement>, pane: PaneLeaf) => void;
  /** いま開いている ▾ のメニュー（aria-expanded に使う） */
  openWithShown: OpenWithKind | null;
  /** タブの列の何もないところの右クリック（ボードの右のパネルだけ。見出しの置き方を選ぶ） */
  onBarMenu?: (e: React.MouseEvent) => void;
  /** チャットのタブの名前をその場で変える（ダブルクリック・右クリックの「名前を変更」。パネル全体で 1 つ） */
  rename: ReturnType<typeof useRunRename>;
}) {
  const insertAt = drag.insertAt(pane.id);
  // 表示中のタブが並びの外（横にスクロールした先）にあれば、見えるところまで動かす（新しく開いたタブなど）
  const stripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    stripRef.current?.querySelector(".panel-tab.active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [pane.active, pane.tabs.length]);
  /** 右・下に分ける: タブが 2 つ以上なら表示中のタブを新しいペインへ移し、1 つ以下なら空のペインを作る */
  const splitTo = (dir: SplitDir) => panel.splitPane(pane.id, dir, "after", pane.tabs.length > 1 ? (pane.active ?? undefined) : undefined);
  // チャットのタブの状態（作業中・回答待ち・未読・既読。サイドバーの行と同じ印）
  const { stateOf } = useRunStates();
  // チャットのタブに添えるグループ名（タブのプロジェクトごとに 1 回だけ読む）
  const groupName = useGroupNames(panel.tabs.flatMap((t) => (t.kind === "chat" ? [t.projectId] : [])));
  const chatRunOf = (t: { id: number; status?: Run["status"]; attention?: boolean }) =>
    panel.runs.find((r) => r.id === t.id) ?? (t.status ? ({ id: t.id, status: t.status, attention: Boolean(t.attention) } as Run) : undefined);
  // まとめ方を選んでいれば、まとまりごとに並べ替えて見せる（display は見た目の並び。タブの中身が残っているものだけ）
  const [grouping] = useTabGrouping();
  const { clusterOf, clusterOfRun } = useTabClusters(panel, grouping);
  const known = pane.tabs.filter((key) => panel.tabs.some((t) => t.key === key));
  const clusters = grouping === "none" ? null : clusterTabs(known, clusterOf);
  const display = clusters ? clusters.flatMap((c) => c.tabs) : known;
  /**
   * まとまり（グループ・作業場所）のチャット: タブで開いているチャットと、ボードの一覧のうち同じまとまりに入るもの（タブで開いていないものも）。
   * 「その他」はチャットが入らないので undefined（札を押せない）
   */
  const clusterRuns = (c: TabCluster): Run[] | undefined => {
    if (c.key === OTHER_CLUSTER.key) return undefined;
    const open = c.tabs.flatMap((key) => {
      const t = panel.tabs.find((x) => x.key === key);
      const run = t?.kind === "chat" ? (panel.runs.find((r) => r.id === t.id) ?? t.run) : undefined;
      return run ? [run] : [];
    });
    return [...open, ...panel.runs.filter((r) => !open.some((o) => o.id === r.id) && clusterOfRun(r).key === c.key)];
  };
  /** タブ 1 つ（i は見た目の並びの位置。ドラッグで落とす位置の印もこの並びで付ける） */
  const tab = (key: string, i: number) => {
    const t = panel.tabs.find((x) => x.key === key);
    if (!t) return null;
    const { Icon, iconClass, label, group: newGroup } = tabLabel(t, panel.runs);
    // チャットのタブの状態（未読・失敗のタブは名前も太字にする。サイドバーの行と同じ）
    const chatRun = t.kind === "chat" ? chatRunOf(t) : undefined;
    const chatState = chatRun && stateOf(chatRun);
    const busyUnread = Boolean(chatRun && chatState && busyWithUnread(chatRun, chatState));
    // どのグループのチャットか（ボードの一覧になければ、タブの中のチャットから届いたもの）
    const group = t.kind === "chat" ? groupName(t.projectId, (panel.runs.find((r) => r.id === t.id) ?? t.run)?.group_id) : newGroup;
    return (
      <PanelTab
        key={t.key}
        active={pane.active === t.key}
        icon={Icon}
        iconClass={iconClass}
        label={label}
        // グループ別にまとめているときは、まとまりの頭にグループ名が出るので、タブには添えない（名前を省かずに見せる）
        group={grouping === "group" ? undefined : group}
        title={t.kind === "browser" ? t.url : t.kind === "terminal" ? t.cwd : group ? `${label}（グループ: ${group}）` : label}
        className={cx(
          insertAt === i && "split-insert-before",
          insertAt === display.length && i === display.length - 1 && "split-insert-after",
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
  };
  return (
    <div
      className={cx("panel-tabs", insertAt !== null && pane.tabs.length === 0 && "split-insert-bar")}
      role="tablist"
      inert={inert}
      onPointerDown={() => panel.focusPane(pane.id)}
      onContextMenu={onBarMenu}
      {...drag.barProps(pane.id, (i) => paneIndexOf(i, display, pane.tabs))}
    >
      {controls}
      <div ref={stripRef} className={cx("panel-tab-strip", clusters && "grouped")}>
      {clusters
        ? clusters.map((c) => {
            // まとまりごとに 1 つの枠に入れ、色の付いた名前の札・薄い地・下の線で、どこからどこまでが 1 つのまとまりかを見せる（ブラウザのタブのグループと同じ）
            const hue = clusterHue(c.key);
            return (
              <div key={c.key} className={cx("panel-tab-group", hue === null && "plain")} style={hue === null ? undefined : ({ "--group-hue": hue } as CSSProperties)}>
                <TabClusterHead cluster={c} runs={clusterRuns(c)} onOpen={(run) => panel.open(run)} />
                {c.tabs.map((key) => tab(key, display.indexOf(key)))}
              </div>
            );
          })
        : display.map(tab)}
      </div>
      {/* 新しいタブ: チャット・ブラウザ・ターミナルを 1 回で開く（タブのすぐ右） */}
      <span className="panel-bar-buttons panel-tab-adds">
        <IconButton icon={SquarePen} label="新しいチャット" size={14} onClick={onNewChat} />
        {/* ブラウザ・ターミナルは、アイコンで新しいタブ、横の ▾ で外のアプリで開く・外のアプリを選ぶ（デスクトップアプリだけ） */}
        <span className="panel-split-button">
          <IconButton icon={Globe} label="ブラウザを開く" title="ブラウザを新しいタブで開く" size={14} onClick={() => panel.openBrowser()} />
          {window.kickoff && (
            <IconButton
              icon={ChevronDown}
              label="ブラウザの開き方"
              title="新しいタブで開く・外のブラウザで開く・外のブラウザを選ぶ"
              size={12}
              className="panel-open-with panel-open-with-browser"
              aria-haspopup="menu"
              aria-expanded={openWithShown === "browser"}
              onClick={(e) => onOpenWith("browser", e, pane)}
            />
          )}
        </span>
        {terminals > 0 && (
          <span className="panel-split-button">
            <IconButton
              icon={SquareTerminal}
              label="ターミナルを開く"
              title="ターミナルを新しいタブで開く（チャットを表示しているときは、その作業場所で開く）"
              size={14}
              className="panel-tab-terminal"
              aria-haspopup={terminals > 1 ? "menu" : undefined}
              aria-expanded={terminals > 1 ? terminalMenuOpen : undefined}
              onClick={(e) => onTerminal(e, pane)}
            />
            <IconButton
              icon={ChevronDown}
              label="ターミナルの開き方"
              title="新しいタブで開く・外のターミナルで開く・外のターミナルを選ぶ"
              size={12}
              className="panel-open-with panel-open-with-terminal"
              aria-haspopup="menu"
              aria-expanded={openWithShown === "terminal"}
              onClick={(e) => onOpenWith("terminal", e, pane)}
            />
          </span>
        )}
      </span>
      {/* ペインを分ける・閉じる（右端） */}
      <span className="panel-bar-buttons panel-pane-tools">
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
