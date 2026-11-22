import { Activity, lazy, memo, Suspense, useContext, useMemo, type CSSProperties } from "react";
import { cx } from "@/foundation/ui/lib/cx";
import { BrowserPane } from "@/features/browser/ui/BrowserPane";
import { useAgentBrowsing } from "@/features/browser/ui/agentBrowsing";
import { ChatScreen } from "@/features/conversation/ui/screen/ChatScreen";
import { chatPaneSlot } from "@/features/chat/ui/screen/ports";
import { SubagentScreen } from "@/features/conversation/ui/screens/SubagentScreen";
import { SideChanges } from "@/features/git/ui/SideChanges";
import { SideChildChat } from "@/features/conversation/ui/screens/SideChildChat";
import { NewChildPane } from "@/features/conversation/ui/screens/NewChildPane";
import { createdChildPlace, openChat } from "@/features/chat/ui/open/openChat";
import { SideNote } from "@/features/notes/ui/SideNote";
import { LazyDatabaseClient } from "@/features/database/ui/LazyDatabaseClient";
import { GitHubTab } from "@/features/github/ui/GitHubTab";
import { CiTab } from "@/features/github/ui/ci/CiTab";
import { DockerTab } from "@/features/docker/ui/DockerTab";
import { TrashTab } from "@/features/trash/ui/TrashTab";
import { ProjectFileTab } from "@/features/files/ui/ProjectFileTab";
import { SideFileView } from "@/features/files/ui/SideFileView";
import { SideProjectView } from "@/features/projects/ui/views/SideProjectView";
import { childTab, noteTab, terminalTitle } from "./tabData";
import { canPopOut, popOutTab } from "./popOutTab";
import { TabPageContext, TabVisibleContext } from "./tabPageContext";
import { useKeepAlive } from "@/features/chat/ui/screen/keepAlive";
import { NewChatPane } from "@/features/chatPanel/ui/tabs/NewChatPane";
import { moveDraftSidePanel } from "@/features/chatPanel/ui/agents/draftSide";
import { kindOf, panelStateOf } from "@/features/panel/ui/state/panelStore";
import type { TabPageProps } from "@/features/panel/ui/kind";
import { projectOfPanel } from "@/features/panel/ui/surfaces";
import { openSideBrowser } from "@/features/browser/ui/panel/openBrowserTab";
import { api } from "@/foundation/ui/api";
import { reportFailure } from "@/foundation/ui/kit/ask";
import type { PanelTab, PanelPageOps } from "@/features/panel/ui/usePanel";

// xterm.js は、ターミナルのタブを開いたときだけ読み込む
const TerminalPane = lazy(() => import("@/features/terminal/ui/TerminalPane"));

/** 種類 K のタブの中身に渡すもの */
type PageOf<K extends PanelTab["kind"]> = TabPageProps<Extract<PanelTab, { kind: K }>>;

// タブの種類ごとの中身（どの部品を描き、中身からの知らせでタブをどう変えるか。種類の項目の Page は tabKinds.ts）。中身からタブへの知らせは、どれも patchTab（その種類のタブの中身だけを変える）か、
// 送った新しいチャットを置き換える replaceWithChat・replaceTab（新しい子チャット・名前を変えたノート）

export function NewChatPage({ tab: t, panel, visible }: PageOf<"new">) {
  return (
    <NewChatPane
      tabKey={t.key}
      projectId={t.projectId}
      group={t.group}
      title={t.title}
      worktree={t.worktree}
      seed={t.seed}
      draftText={t.draftText}
      draftAttachments={t.draftAttachments}
      // 送る前の添付はタブに残す（プロジェクトを移って戻っても・再起動しても、外すまで残る。入力欄がなくなってから終わったアップロードも足す）
      saveAttachments={(list) => panel.patchTab(t.key, { kind: "new", fields: { draftAttachments: [...list] } })}
      visible={visible}
      // 作業場所を選び直したら、タブのまとまり（作業場所別）も合わせる
      onWorktreeChange={(worktree) => panel.patchTab(t.key, { kind: "new", fields: { worktree } })}
      onGroupChange={(group, groupName) => panel.patchTab(t.key, { kind: "new", fields: { group, groupName } })}
      onCreated={(chat) => {
        // 固定していた下書きは、できたチャットも固定する（送るまでの間に固定を付け外ししていても、いまの値で）
        const now = panelStateOf(panel.key).tabs.find((x) => x.key === t.key);
        if (now?.kind === "new" && now.pinned) void api.pinChat(chat.id, true).catch(reportFailure("ピン留めできませんでした"));
        // 下書きの右の欄（開いたノートなど）は、できたチャットの右の欄へ移す
        moveDraftSidePanel(t.key, chat.id);
        panel.replaceWithChat(t.key, chat);
      }}
      // 空の文は覚えない（書き始める前と同じ形のまま）
      onDraftChange={(text) => panel.patchTab(t.key, { kind: "new", fields: { draftText: text || undefined } })}
    />
  );
}

// チャットの画面の右の欄（サブエージェントの欄）だけに開く。記録から作るものはチャットの店から読み、操作はそのチャットの画面のものを使う。
// 表示していない間は Activity で止める（伝える入力欄の音声入力など、チャットに止めない理由があれば止めない）
export const SubagentPage = ({ tab: t, visible }: PageOf<"subagent">) => <SubagentTabPage chatId={t.chatId} agentKey={t.agentKey} visible={visible} />;

// チャットの画面の右の欄だけに開く。作業場所のコミットしていない変更（押したファイルの位置へ移る）と、ファイルの中身
export const ChangesPage = ({ tab: t }: PageOf<"changes">) => <SideChanges projectId={t.projectId} worktree={t.worktree} focus={t.focus} focusAt={t.focusAt} />;

// チャットの画面の右の欄だけに開く。プロジェクトの「ファイル」「検索」「履歴」タブと同じ画面
export const ProjectViewPage = ({ tab: t }: PageOf<"projectView">) => <SideProjectView chatId={t.chatId} projectId={t.projectId} worktree={t.worktree} view={t.view} />;

// プロジェクトの「ファイル」「検索」「変更」タブの右だけに開く（中身が使う Git の状態などは EditorTab が FileTabsContext で渡す）
export const ProjectFilePage = ({ tab: t, panel }: PageOf<"projectFile">) => <ProjectFileTab tab={t} panelKey={panel.key} />;

export const FilePage = ({ tab: t, panel }: PageOf<"file">) => <SideFileView projectId={t.projectId} worktree={t.worktree} path={t.path} line={t.line} tabOf={{ panelKey: panel.key, tabKey: t.key }} />;

// チャットの画面の右の欄だけに開く。プロジェクトのノート（自動で保存）と、子チャット（孫・ひ孫も、いちばん上の親の右の欄）
// 名前を変えたら、新しい名前のノートのタブに置き換える（同じ位置のまま）
export const NotePage = ({ tab: t, panel }: PageOf<"note">) => <SideNote projectId={t.projectId} path={t.path} chatId={t.chatId} onRenamed={(to) => panel.replaceTab(t.key, noteTab({ chatId: t.chatId, projectId: t.projectId, path: to }))} />;

// チャットの画面の右の欄だけに開く。DB クライアント（開いているタブ・木の開き具合はチャットごとに覚える。別ウィンドウと同じ place）
export const DatabasePage = ({ tab: t }: PageOf<"database">) => <LazyDatabaseClient projectId={t.projectId} place={`chat-${t.chatId}`} worktree={t.worktree ?? null} />;

// チャットの画面の右の欄だけに開く。プロジェクトの「GitHub」タブと同じ画面（狭いので一覧と中身を切り替えて出す。絞り込みと開いているものはプロジェクトのタブと共通）
export const GitHubPage = ({ tab: t }: PageOf<"github">) => <GitHubTab projectId={t.projectId} />;

// チャットの画面の右の欄だけに開く。プロジェクトの「CI」「Docker」「ゴミ箱」タブと同じ画面（開いているもの・絞り込みはプロジェクトのタブと共通）
export const CiPage = ({ tab: t }: PageOf<"ci">) => <CiTab projectId={t.projectId} />;
export const DockerPage = ({ tab: t }: PageOf<"docker">) => <DockerTab projectId={t.projectId} />;
export const TrashPage = ({ tab: t }: PageOf<"trash">) => <TrashTab projectId={t.projectId} />;

export function ChildPage({ tab: t, panel, visible }: PageOf<"child">) {
  return (
    <SideChildChat
      chatId={t.childId}
      visible={visible}
      onTitle={(title) => panel.patchTab(t.key, { kind: "child", fields: { title } })}
      slot={chatPaneSlot(panel.key, t.key)}
    />
  );
}

// 新しい子チャット。最初の文を送ったら、できた子チャットのタブに置き換える（同じ位置のまま）。
// 「子チャットを作成」「新しい子チャットで聞く」から開いたタブ（follow）は、設定の「子チャットを作ったとき」が別ウィンドウ・開かないなら、閉じてそちらで開く
export function NewChildPage({ tab: t, panel }: PageOf<"newChild">) {
  return (
    <NewChildPane
      parentId={t.parentId ?? t.chatId}
      quote={t.quote}
      text={t.text}
      attachments={t.attachments}
      eventId={t.eventId}
      onCreated={(child, opts) => {
        const place = t.follow ? createdChildPlace(opts) : "side";
        if (place === "side") return panel.replaceTab(t.key, childTab({ chatId: t.chatId, childId: child.id, projectId: child.project_id, title: child.title }));
        panel.closeTab(t.key);
        if (place === "window") openChat(child, "window");
      }}
    />
  );
}

export function TerminalPage({ tab: t, panel, visible, focused }: PageOf<"terminal">) {
  return (
    <Suspense fallback={<div className="page muted">読み込み中…</div>}>
      <TerminalPane
        termKey={t.key}
        cwd={t.cwd}
        command={t.command}
        env={t.env}
        meta={{ projectId: t.projectId, title: terminalTitle(t) }}
        visible={visible}
        focused={visible && focused}
        // ブラウザは右サイドバー（チャット欄）だけに置くので、そのターミナルのプロジェクトの右サイドバーで開く
        onOpenUrl={(url) => openSideBrowser(t.projectId, url)}
        projectId={projectOfPanel(panel.key)}
      />
    </Suspense>
  );
}

export function BrowserPage({ tab: t, panel, visible }: PageOf<"browser">) {
  return (
    <BrowserPane
      url={t.current ?? t.url}
      visible={visible}
      onOpenTab={(url, background) => {
        // クリックしたブラウザのペインに足し、リンク・画像なら今のタブを表示したままにする
        panel.showTab(t.key);
        if (background) panel.addBrowserBehind(url);
        else panel.openBrowser(url);
      }}
      // AI に操作させるため、どのパネルのどのタブかをメインプロセスに登録する（プロジェクトの欄でなければプロジェクトは null）
      agentTarget={{ tabKey: t.key, projectId: projectOfPanel(panel.key) }}
      // 空のページのあいだは「新しいタブ」と表示する
      onChange={({ url, title }) => panel.patchTab(t.key, { kind: "browser", fields: { title: url === "about:blank" ? "" : title, current: url } })}
    />
  );
}

/** チャットのタブ: パネルのタブに置いたチャットの画面 */
export function ChatTabPage({ tab: t, panel, visible }: PageOf<"chat">) {
  const tabPage = useContext(TabPageContext);
  return (
    <ChatScreen
      chatId={t.id}
      focus={t.focus}
      visible={visible}
      host={{
        surface: "tab",
        pausable: true,
        // 送信待ちの指示・選んだ文を新しいチャットで聞くときは、このパネルに新しいチャットのタブを開く
        openNewChat: panel.openNew,
        // 隠れた画面で移る・動きを開くを受けたら、先にこのタブを表に出す
        bringToFront: tabPage?.show,
        slot: chatPaneSlot(panel.key, t.key),
        mainChatId: null,
      }}
      // 移したチャットは、移した先のプロジェクトのものとして扱う（projectId も合わせる）
      onChatChange={(chat) => panel.patchTab(t.key, { kind: "chat", fields: { title: chat.title, projectId: chat.project_id, chat } })}
    />
  );
}

/** 右の欄のサブエージェントのタブ: 裏に回したら（外のチャットのタブが裏に回ったときも）止め、記録が届いても描き直さない */
function SubagentTabPage({ chatId, agentKey, visible }: { chatId: number; agentKey: string; visible: boolean }) {
  const keepAlive = useKeepAlive(chatId);
  return (
    <Activity mode={visible || keepAlive ? "visible" : "hidden"}>
      <SubagentScreen chatId={chatId} agentKey={agentKey} />
    </Activity>
  );
}

type FrameProps = {
  tab: PanelTab;
  /** 欄の操作（usePanel の pageOps。欄の状態が変わっても同じ物） */
  panel: PanelPageOps;
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
};

/** 置き場所の style が同じか（分けているときの位置は描くたびに作られるので中身で比べる） */
function sameStyle(a: CSSProperties | undefined, b: CSSProperties | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const keys = Object.keys(a) as (keyof CSSProperties)[];
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
}

/**
 * パネルの 1 つのタブの中身（中身は種類の項目の Page）。
 * タブを切り替えても入力中の文章やスクロール位置が残るよう、表示していないタブも hidden で残す。
 * ペインを分けても作り直さない（webview・ターミナル・入力中の文を保つ）よう、どのタブもパネルの中身の直下に置き、
 * 分けているときは style でそのペインの位置に重ねる。押す・ピントが入るとそのペインにピントを移す。
 * タブ・欄の操作・置き場所が変わらなければ描き直さない（ほかのタブのチャットが変わってパネルの店が変わっても、ほかのタブは描き直らない）
 */
export const PanelTabPage = memo(
  PanelTabPageBody,
  (a, b) =>
    a.tab === b.tab &&
    a.panel === b.panel &&
    a.panelOpen === b.panelOpen &&
    a.paneId === b.paneId &&
    a.active === b.active &&
    a.focused === b.focused &&
    a.split === b.split &&
    sameStyle(a.style, b.style),
);

function PanelTabPageBody({
  tab,
  panel,
  panelOpen,
  paneId,
  active,
  focused,
  style,
  split = false,
}: FrameProps) {
  const focus = () => panel.focusPane(paneId);
  const Page = kindOf(tab).Page;
  // 中身の見出しの右端の「別ウィンドウで開く」（PopOutTabButton）に渡す
  const popOutable = canPopOut(tab);
  // このタブを表に出す（入れ子の欄（チャットの画面の右の欄）なら、外のチャットのタブも表に出す）
  const outer = useContext(TabPageContext);
  const actions = useMemo(
    () => ({
      popOut: popOutable ? () => popOutTab(panel, tab.key) : null,
      show: () => {
        outer?.show();
        panel.showTab(tab.key);
      },
    }),
    [popOutable, panel, tab.key, outer],
  );
  // AI が操作しているブラウザのタブは、表に出ていなくても見えない形で並べる（撮る・押すため。browser.css）
  const agentBrowsing = useAgentBrowsing(tab.kind === "browser" ? tab.key : null);
  // 表示中か（外のタブ（右の欄を持つチャットのタブ）が裏に回っていれば、自分のペインで選んでいても表示していない）
  const visible = useContext(TabVisibleContext) && panelOpen && active;
  return (
    <div
      className={cx("panel-tab-page", split && focused && "pane-focused", agentBrowsing && "agent-browsing")}
      // タブのドラッグのサムネイルを撮る範囲を見つける印（layout/tabThumbnail.ts）
      data-tab-key={tab.key}
      hidden={!active}
      style={style}
      onPointerDownCapture={focus}
      onFocusCapture={focus}
    >
      <TabPageContext.Provider value={actions}>
        <TabVisibleContext.Provider value={visible}>
          <Page tab={tab} panel={panel} visible={visible} focused={focused} />
        </TabVisibleContext.Provider>
      </TabPageContext.Provider>
    </div>
  );
}
