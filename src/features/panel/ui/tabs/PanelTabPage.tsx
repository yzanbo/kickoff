import { lazy, memo, Suspense, useContext, useMemo, useSyncExternalStore, type CSSProperties } from "react";
import { cx } from "@/foundation/ui/lib/cx";
import { SideChanges } from "@/features/git/ui/SideChanges";
import { LazyDatabaseClient } from "@/features/database/ui/LazyDatabaseClient";
import { GitHubTab } from "@/features/github/ui/GitHubTab";
import { CiTab } from "@/features/github/ui/ci/CiTab";
import { DockerTab } from "@/features/docker/ui/DockerTab";
import { TrashTab } from "@/features/trash/ui/TrashTab";
import { SideProjectView } from "@/features/projects/ui/views/SideProjectView";
import { terminalTitle } from "./tabData";
import { canPopOut, popOutTab } from "./popOutTab";
import { TabPageContext, TabVisibleContext } from "./tabPageContext";
import { kindOf } from "@/features/panel/ui/state/panelStore";
import type { TabPageProps } from "@/features/panel/ui/kind";
import { projectOfPanel } from "@/features/panel/ui/surfaces";
import { openSideBrowser } from "@/features/browser/ui/panel/openBrowserTab";
import type { PanelTab, PanelPageOps } from "@/features/panel/ui/usePanel";

// xterm.js は、ターミナルのタブを開いたときだけ読み込む
const TerminalPane = lazy(() => import("@/features/terminal/ui/TerminalPane"));

/** 種類 K のタブの中身に渡すもの */
type PageOf<K extends PanelTab["kind"]> = TabPageProps<Extract<PanelTab, { kind: K }>>;

// まだ持ち主の機能へ移していないタブの種類の中身（種類の項目の Page は tabKinds.ts。チャット・ファイル・ノート・ブラウザの中身は持ち主の機能の種類の項目）

// チャットの画面の右の欄だけに開く。作業場所のコミットしていない変更（押したファイルの位置へ移る）
export const ChangesPage = ({ tab: t }: PageOf<"changes">) => <SideChanges projectId={t.projectId} worktree={t.worktree} focus={t.focus} focusAt={t.focusAt} />;

// チャットの画面の右の欄だけに開く。プロジェクトの「ファイル」「検索」「履歴」タブと同じ画面
export const ProjectViewPage = ({ tab: t }: PageOf<"projectView">) => <SideProjectView chatId={t.chatId} projectId={t.projectId} worktree={t.worktree} view={t.view} />;

// チャットの画面の右の欄だけに開く。DB クライアント（開いているタブ・木の開き具合はチャットごとに覚える。別ウィンドウと同じ place）
export const DatabasePage = ({ tab: t }: PageOf<"database">) => <LazyDatabaseClient projectId={t.projectId} place={`chat-${t.chatId}`} worktree={t.worktree ?? null} />;

// チャットの画面の右の欄だけに開く。プロジェクトの「GitHub」タブと同じ画面（狭いので一覧と中身を切り替えて出す。絞り込みと開いているものはプロジェクトのタブと共通）
export const GitHubPage = ({ tab: t }: PageOf<"github">) => <GitHubTab projectId={t.projectId} />;

// チャットの画面の右の欄だけに開く。プロジェクトの「CI」「Docker」「ゴミ箱」タブと同じ画面（開いているもの・絞り込みはプロジェクトのタブと共通）
export const CiPage = ({ tab: t }: PageOf<"ci">) => <CiTab projectId={t.projectId} />;
export const DockerPage = ({ tab: t }: PageOf<"docker">) => <DockerTab projectId={t.projectId} />;
export const TrashPage = ({ tab: t }: PageOf<"trash">) => <TrashTab projectId={t.projectId} />;

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

/** 足すクラスのない種類の購読（何も知らせない） */
const noSubscribe = () => () => {};

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
  const kind = kindOf(tab);
  const Page = kind.Page;
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
  // 種類が足すクラス（AI が操作しているブラウザのタブは、表に出ていなくても見えない形で並べる。撮る・押すため。browser.css）
  const pageClass = useSyncExternalStore(kind.pageClass?.subscribe ?? noSubscribe, () => kind.pageClass?.of(tab));
  // 表示中か（外のタブ（右の欄を持つチャットのタブ）が裏に回っていれば、自分のペインで選んでいても表示していない）
  const visible = useContext(TabVisibleContext) && panelOpen && active;
  return (
    <div
      className={cx("panel-tab-page", split && focused && "pane-focused", pageClass)}
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
