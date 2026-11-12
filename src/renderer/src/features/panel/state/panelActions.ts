import type { Chat } from "@shared/types";
import type { NewChatSeed } from "@/features/chat/queue/askInNewChat";
import type { PaneLayout, SplitDir, SplitSide } from "@/features/panel/layout/paneTree";
import { focusPane, moveTab, returnToHome, splitPane } from "@/features/panel/layout/paneLayout";
import { equalizeSplit, setSplitSizes } from "@/features/panel/layout/paneSizes";
import { parsePanelKey, SURFACES } from "@/features/panel/surfaces";
import type { NewChatTarget, PanelTab, ProjectView, TerminalTarget } from "@/features/panel/tabs/panelTypes";
import { browserTab, changesTab, chatTab, childTab, databaseTab, fileTab, githubTab, kindOfTab, memoTab, newChatTab, newChildTab, newTabKey, projectViewTab, subagentTab, terminalTab } from "@/features/panel/tabs/tabKinds";
import { readKinds, showKind } from "./panelKinds";
import type { PanelAction, TabPatch } from "./panelState";
import { dispatchPanel, panelStateOf } from "./panelStore";

/** 新しいチャットのタブを最後に開いたもの（欄ごと。開発時の effect の二重実行で、同じタブを 2 つ開かないように） */
const lastNew = new Map<string, { target: string; key: string; at: number }>();

/**
 * 欄のパネル（覚える名前 key）の操作。部品の外からも使え、usePanel が束ねて返す。
 * 開く操作は、自分で開くタブはピントのあるペインに足し（すでにあればそのペインで表示）、欄も開く。隠している種類のタブなら、その種類を出す
 */
export function panelActions(key: string) {
  const at = parsePanelKey(key);
  const dispatch = (action: PanelAction) => dispatchPanel(key, action);
  const changeLayout = (change: (layout: PaneLayout) => PaneLayout) => dispatch({ type: "layout", change });

  const openTab = (tab: PanelTab, reopen?: TabPatch) => {
    if (at) showKind(at.surface, kindOfTab(tab));
    dispatch({ type: "open", tab, reopen });
  };

  /**
   * 新しいチャットのタブを開く（ボードや列・グループの＋、サイドバーの＋など）。ブラウザ・ターミナルと同じく、押すたびに新しいタブを開く
   * （書きかけの新しいチャットがあっても、もう 1 つ始められる）。seed は初めに入力欄に入れるもの（送信待ちの指示から始めたとき）
   */
  const openNew = (target: NewChatTarget, seed?: NewChatSeed) => {
    // 同じ指定でほぼ同時に呼ばれたとき（開発時の effect の二重実行）だけ 1 つにまとめる（初めの入力があるものは利用者の操作なのでまとめない）
    const sig = `${target.projectId}:${target.group ?? ""}:${target.worktree ?? ""}`;
    const recent = lastNew.get(key);
    const tabKey = !seed && recent && recent.target === sig && Date.now() - recent.at < 100 ? recent.key : newTabKey("new");
    lastNew.set(key, { target: sig, key: tabKey, at: Date.now() });
    openTab(newChatTab(target, seed, tabKey));
    return tabKey;
  };

  /** 内蔵ターミナルの新しいタブを開く（開く場所のフォルダでシェルを始める） */
  const openTerminal = (target: TerminalTarget) => openTab(terminalTab(target));

  const setOpen = (open: boolean) => dispatch({ type: "setOpen", open });

  return {
    /**
     * チャットをタブで開く（開いていればそのタブへ）。focus は検索結果から開いたときに、スクロールして強調する発言
     * （開いていたタブは作り直さず、強調する発言だけを変える。名前・タブの中のチャットから届いたものは残す）
     */
    open: (chat: Pick<Chat, "id" | "project_id"> & Partial<Pick<Chat, "title">>, focus?: number) =>
      openTab(chatTab(chat, focus), focus ? { kind: "chat", fields: { focus } } : undefined),
    openNew,
    /** サブエージェントの画面をタブで開く（チャットの画面の右の欄。同じサブエージェントのタブがあればそのペインで表示する） */
    openSubagent: (target: { chatId: number; agentKey: string; title: string; path?: string }) => openTab(subagentTab(target)),
    /**
     * 作業場所のコミットしていない変更をタブで開く（チャットの画面の右の欄。作業場所ごとに 1 つのタブで、あればそのペインで表示する）。
     * focus を渡すとそのファイルの差分の位置へ移る（押し直しても移るよう、頼んだ時刻も変える）
     */
    openChanges: (target: { chatId: number; projectId: number; worktree?: string; focus?: string }) => {
      const tab = changesTab(target);
      openTab(tab, tab.focus ? { kind: "changes", fields: { focus: tab.focus, focusAt: tab.focusAt } } : undefined);
    },
    /**
     * 作業場所のファイルの中身をタブで開く（チャットの画面の右の欄。同じファイルのタブがあればそのペインで表示し、目立たせる行だけを変える）
     */
    openFile: (target: { chatId: number; projectId: number; worktree?: string; path: string; line?: number }) =>
      openTab(fileTab(target), { kind: "file", fields: { line: target.line } }),
    /** プロジェクトの「ファイル」「検索」「履歴」タブと同じ画面をタブで開く（チャットの画面の右の欄。種類ごとに 1 つのタブで、あればそのペインで表示する） */
    openProjectView: (target: { chatId: number; projectId: number; worktree?: string; view: ProjectView }) => openTab(projectViewTab(target)),
    /** プロジェクトのメモをタブで開く（チャットの画面の右の欄。同じメモのタブがあればそのペインで表示する） */
    openMemo: (target: { chatId: number | null; projectId: number; path: string }) => openTab(memoTab(target)),
    /** DB クライアントをタブで開く（チャットの画面の右の欄。欄に 1 つのタブで、あればそのペインで表示する） */
    openDatabase: (target: { chatId: number; projectId: number; worktree?: string }) => openTab(databaseTab(target)),
    /** プロジェクトの「GitHub」タブと同じ画面をタブで開く（チャットの画面の右の欄。欄に 1 つのタブで、あればそのペインで表示する） */
    openGitHub: (target: { chatId: number; projectId: number }) => openTab(githubTab(target)),
    /** 子チャットをタブで開く（いちばん上の親のチャットの画面の右の欄。同じ子チャットのタブがあればそのペインで表示する） */
    openChild: (target: { chatId: number; childId: number; projectId: number; title: string }) => openTab(childTab(target)),
    /** 新しい子チャットのタブを開く（チャットの画面の右の欄の「＋」。押すたびに新しいタブ。最初の文を送ると、できた子チャットのタブになる） */
    openNewChild: (target: Parameters<typeof newChildTab>[0]) => openTab(newChildTab(target)),
    /** ブラウザの新しいタブを開き、そのキーを返す（url がなければ空のページで、アドレス欄に入力して開く） */
    openBrowser: (url = "") => {
      const tab = browserTab(url);
      openTab(tab);
      return tab.key;
    },
    /** ブラウザのタブを表に出さずに足し、そのキーを返す（AI が「裏で」開いたとき。見ているタブ・欄の開閉は変えない） */
    addBrowserBehind: (url: string) => {
      const tab = browserTab(url);
      if (at) showKind(at.surface, "browser");
      dispatch({ type: "add", tab });
      return tab.key;
    },
    openTerminal,
    /** 作ったタブを開く（領域ごとの種類のタブ。プロジェクトのファイルのタブ（features/editor/fileTabs.ts）など。同じキーのタブがあればそのペインで表示する） */
    openPanelTab: (tab: PanelTab) => openTab(tab),
    /** 開いているタブを表示する（タブ・下書きを押したとき。隠している種類のタブなら、その種類を出す。ないタブなら何もしない） */
    showTab: (tabKey: string) => {
      const tab = panelStateOf(key).tabs.find((t) => t.key === tabKey);
      if (tab && at) showKind(at.surface, kindOfTab(tab));
      dispatch({ type: "show", key: tabKey });
    },
    /** タブの中身を変える（新しいチャットのプロジェクト・グループ、ブラウザのタイトルなど。その種類のタブだけ） */
    patchTab: (tabKey: string, patch: TabPatch) => dispatch({ type: "patch", key: tabKey, ...patch }),
    /** タブを別のタブに置き換える（同じペインの同じ位置のまま。名前を変えたメモのタブなど、キーが変わるとき） */
    replaceTab: (tabKey: string, tab: PanelTab) => dispatch({ type: "replace", key: tabKey, tab }),
    /** 新しいチャットを送ったら、そのタブをできたチャットのタブに置き換える（同じペインの同じ位置のまま） */
    replaceWithChat: (tabKey: string, chat: Chat) => dispatch({ type: "replace", key: tabKey, tab: chatTab(chat) }),
    /**
     * タブを閉じる（表示中のタブならそのペインの隣のタブへ。空になったペインは消す）。dismiss: false はアーカイブ・削除のあと
     * （サイドバーに出ている間は連動でまた出る）。ふだんは表示だけ消したことにして、連動で出し直さない
     */
    closeTab: (tabKey: string, { dismiss = true }: { dismiss?: boolean } = {}) => dispatch({ type: "close", keys: [tabKey], dismiss }),
    /** タブを一覧のペインへ戻す（分けたペインで、サイドバーと連動したチャットのタブを閉じたとき。表示だけ消したことにはしない） */
    returnToHome: (tabKey: string) => changeLayout((l) => returnToHome(l, tabKey)),
    setOpen,
    close: () => setOpen(false),
    /**
     * 開閉。開くときに見せているタブがなければ、欄の決まり（SURFACES の openWhenEmpty）でタブを始める
     * （チャット欄 = チャットを出す欄なら新しいチャット / フッター = ターミナルを出す欄で、開く場所 terminal が決まっていればターミナル）
     */
    toggle: ({ terminal, noChat = false }: { terminal?: TerminalTarget; noChat?: boolean } = {}) => {
      const state = panelStateOf(key);
      if (state.open || !at) return setOpen(!state.open);
      const kinds = readKinds(at.surface, noChat);
      const empty = !state.tabs.some((t) => kinds.includes(kindOfTab(t)));
      const start = SURFACES[at.surface].openWhenEmpty;
      if (empty && start === "newChat" && kinds.includes("chat") && typeof at.scope === "number") return openNew({ projectId: at.scope });
      if (empty && start === "terminal" && kinds.includes("terminal") && terminal) return openTerminal(terminal);
      setOpen(true);
    },
    /** ペインにピントを移す（ペインを押した・ペインの中で操作したとき。新しく開くタブはここに入る） */
    focusPane: (paneId: string) => changeLayout((l) => focusPane(l, paneId)),
    /** ペインを分ける。tabKey があればそのタブを新しいペインへ移し、なければ空のペインを作る */
    splitPane: (paneId: string, dir: SplitDir, side: SplitSide, tabKey?: string) => {
      // ID は配置を変える関数の外で作る（同じ操作で同じ ID になるように）
      const id = newTabKey("pane");
      changeLayout((l) => splitPane(l, paneId, dir, side, id, tabKey));
    },
    /** タブを別のペイン（同じペインなら並べ替え）の index の位置へ移す */
    moveTab: (tabKey: string, paneId: string, index?: number) => changeLayout((l) => moveTab(l, tabKey, paneId, index)),
    /** ペインを閉じる（サイドバーと連動したチャットは一覧のペインへ戻し、ほかのタブは閉じる。最後の 1 つは閉じない） */
    closePane: (paneId: string) => dispatch({ type: "closePane", paneId }),
    /** 境目をドラッグして割合を変える（path は分割の場所） */
    resizeSplit: (path: number[], sizes: number[]) => changeLayout((l) => setSplitSizes(l, path, sizes)),
    /** 境目のダブルクリックで等分に戻す */
    equalizeSplit: (path: number[]) => changeLayout((l) => equalizeSplit(l, path)),
    /** チャットのタブを、サイドバーの一覧にそろえる */
    sync: (chats: readonly Chat[]) => dispatch({ type: "sync", chats }),
  };
}
