import { lazy, Suspense, type CSSProperties, type ReactNode } from "react";
import { cx } from "@/lib/cx";
import { BrowserPane } from "@/features/browser/BrowserPane";
import { ChatPane } from "@/features/chat/pane/ChatPane";
import { chatPaneSlot } from "@/features/chat/pane/chatPaneContext";
import { SubagentScreen } from "@/features/chat/subagents/SubagentScreen";
import { SideChanges } from "@/features/editor/SideChanges";
import { SideChildChat } from "@/features/chat/children/SideChildChat";
import { SideMemo } from "@/features/memo/SideMemo";
import { SideFileView } from "@/features/editor/SideFileView";
import { memoTab } from "./tabKinds";
import { canPopOut, popOutTab } from "./popOutTab";
import { TabPageContext } from "./tabPageContext";
import { NewChatPane } from "./NewChatPane";
import type { PanelTab, PanelController } from "@/features/panel/usePanel";

// xterm.js は、ターミナルのタブを開いたときだけ読み込む
const TerminalPane = lazy(() => import("@/features/terminal/TerminalPane"));

type TabKind = PanelTab["kind"];

interface PageProps<T extends PanelTab> {
  tab: T;
  panel: PanelController;
  /** 欄を開いていて、自分のペインで表示中か */
  visible: boolean;
  /** 自分のペインにピントがあるか（ターミナルの入力先） */
  focused: boolean;
}

/**
 * タブの種類ごとの中身（どの部品を描き、中身からの知らせでタブをどう変えるか）。中身からタブへの知らせは、どれも patchTab（その種類のタブの中身だけを変える）か、
 * 送った新しいチャットを置き換える replaceWithChat。種類の決まりのほか（アイコン・名前・後始末・まとまり）は tabKinds.ts の表
 */
const PAGES: { [K in TabKind]: (props: PageProps<Extract<PanelTab, { kind: K }>>) => ReactNode } = {
  chat: ({ tab: t, panel, visible }) => (
    <ChatPane
      chatId={t.id}
      focus={t.focus}
      visible={visible}
      // 送信待ちの指示を新しいチャットで聞くときは、このパネルに新しいチャットのタブを開く
      onOpenNew={panel.openNew}
      // 移したチャットは、移した先のプロジェクトのものとして扱う（projectId も合わせる）
      onChatChange={(chat) => panel.patchTab(t.key, { kind: "chat", fields: { title: chat.title, projectId: chat.project_id, chat } })}
      slot={chatPaneSlot(panel.key, t.key)}
    />
  ),
  new: ({ tab: t, panel, visible }) => (
    <NewChatPane
      projectId={t.projectId}
      group={t.group}
      worktree={t.worktree}
      seed={t.seed}
      draftText={t.draftText}
      visible={visible}
      // 作業場所を選び直したら、タブのまとまり（作業場所別）も合わせる
      onWorktreeChange={(worktree) => panel.patchTab(t.key, { kind: "new", fields: { worktree } })}
      onGroupChange={(group, groupName) => panel.patchTab(t.key, { kind: "new", fields: { group, groupName } })}
      onCreated={(chat) => panel.replaceWithChat(t.key, chat)}
      // 空の文は覚えない（書き始める前と同じ形のまま）
      onDraftChange={(text) => panel.patchTab(t.key, { kind: "new", fields: { draftText: text || undefined } })}
    />
  ),
  // チャットの画面の右の欄（サブエージェントの欄）だけに開く。中身はそのチャットの画面の中にあり、チャットの記録・操作をそのまま使う
  subagent: ({ tab: t }) => <SubagentScreen agentKey={t.agentKey} />,
  // チャットの画面の右の欄だけに開く。作業場所のコミットしていない変更（押したファイルの位置へ移る）と、ファイルの中身
  changes: ({ tab: t }) => <SideChanges projectId={t.projectId} worktree={t.worktree} focus={t.focus} focusAt={t.focusAt} />,
  file: ({ tab: t }) => <SideFileView projectId={t.projectId} worktree={t.worktree} path={t.path} line={t.line} />,
  // チャットの画面の右の欄だけに開く。プロジェクトのメモ（自動で保存）と、子チャット（孫・ひ孫も、いちばん上の親の右の欄）
  // 名前を変えたら、新しい名前のメモのタブに置き換える（同じ位置のまま）
  memo: ({ tab: t, panel }) => <SideMemo projectId={t.projectId} path={t.path} onRenamed={(to) => panel.replaceTab(t.key, memoTab({ chatId: t.chatId, projectId: t.projectId, path: to }))} />,
  child: ({ tab: t, panel, visible }) => (
    <SideChildChat
      chatId={t.childId}
      visible={visible}
      onTitle={(title) => panel.patchTab(t.key, { kind: "child", fields: { title } })}
    />
  ),
  terminal: ({ tab: t, panel, visible, focused }) => (
    <Suspense fallback={<div className="page muted">読み込み中…</div>}>
      <TerminalPane termKey={t.key} cwd={t.cwd} visible={visible} focused={visible && focused} onOpenUrl={(url) => panel.openBrowser(url)} />
    </Suspense>
  ),
  browser: ({ tab: t, panel }) => (
    <BrowserPane
      url={t.url}
      // 空のページのあいだは「新しいタブ」と表示する
      onChange={({ url, title }) => panel.patchTab(t.key, { kind: "browser", fields: { title: url === "about:blank" ? "" : title, current: url } })}
    />
  ),
};

/** タブの種類の中身を描く（種類と中身の型を結びつけて引く） */
const pageOf = <T extends PanelTab>(tab: T) => PAGES[tab.kind] as unknown as (props: PageProps<T>) => ReactNode;

/**
 * パネルの 1 つのタブの中身（チャット・新しいチャット・サブエージェント・ターミナル・ブラウザ。PAGES）。
 * タブを切り替えても入力中の文章やスクロール位置が残るよう、表示していないタブも hidden で残す。
 * ペインを分けても作り直さない（webview・ターミナル・入力中の文を保つ）よう、どのタブもパネルの中身の直下に置き、
 * 分けているときは style でそのペインの位置に重ねる。押す・ピントが入るとそのペインにピントを移す
 */
export function PanelTabPage({
  tab,
  panel,
  panelOpen,
  paneId,
  active,
  focused,
  style,
  split = false,
}: {
  tab: PanelTab;
  panel: PanelController;
  panelOpen: boolean;
  /** タブが入っているペイン */
  paneId: string;
  /** 自分のペインで表示中のタブか */
  active: boolean;
  /** 自分のペインにピントがあるか */
  focused: boolean;
  style?: CSSProperties;
  /** ペインを分けているか（分けているときだけ、ピントのあるペインをチャット欄の枠の色で示す） */
  split?: boolean;
}) {
  const focus = () => panel.focusPane(paneId);
  const Page = pageOf(tab);
  // 中身の見出しの右端の「別ウィンドウで開く」（PopOutTabButton）に渡す
  const actions = { popOut: canPopOut(tab) ? () => popOutTab(panel, tab.key) : null };
  return (
    <div className={cx("panel-tab-page", split && focused && "pane-focused")} hidden={!active} style={style} onPointerDownCapture={focus} onFocusCapture={focus}>
      <TabPageContext.Provider value={actions}>
        <Page tab={tab} panel={panel} visible={panelOpen && active} focused={focused} />
      </TabPageContext.Provider>
    </div>
  );
}
