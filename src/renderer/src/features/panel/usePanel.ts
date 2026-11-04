import { useEffect, useRef } from "react";
import type { Project, Chat } from "@shared/types";
import type { NewChatTarget, PanelTab, TerminalTarget } from "@/features/panel/tabs/panelTypes";
import { cx } from "@/lib/cx";
import { useServerEvent } from "@/api/events";
import { useWindowEvent } from "@/hooks/useWindowEvent";
import { paneActions } from "@/features/panel/layout/paneActions";
import { closeLayoutTabs, isTabVisible, placeTab, renameTab, returnToHome, type PaneLayout } from "@/features/panel/layout/paneLayout";
import { chatKey, syncLinkedTabs } from "@/features/panel/state/linkedTabs";
import { registerPanel } from "@/features/panel/state/panelMemory";
import { usePanelState } from "@/features/panel/state/usePanelState";
import { kindOfTab, usePanelKinds, type PanelSurface } from "@/features/panel/state/panelKinds";
import { useLinkedChats, type LinkScope } from "@/features/panel/state/useLinkedChats";
import { newTabKey } from "@/features/panel/tabs/tabKeys";
import { usePanelWidth } from "./usePanelWidth";
import type { NewChatSeed } from "@/features/chat/queue/askInNewChat";

export type { NewChatTarget, PanelTab, TerminalTarget } from "@/features/panel/tabs/panelTypes";
export { terminalTargets } from "@/features/panel/tabs/panelTypes";

interface Options {
  /** パネルの状態を覚えておく名前（ボードは boardPanelKey。例: "kanban:all"・"kanban:3"、チャット欄は "side:3"） */
  memoryKey: string;
  /**
   * サイドバーと連動する範囲（プロジェクト・全プロジェクト "all"。null なら連動しない）。チャットのタブは、サイドバーに出ているチャットにそろえる
   * （チャットができる・アーカイブして隠す・別のプロジェクトへ移すと、タブも増減する。アーカイブ済みはサイドバーと共通の表示の切り替えに従う）
   */
  scope: LinkScope;
  /** どの欄か（表示するタブの種類・タブのまとめ方を欄ごとに覚える。初めはボードの右のパネル） */
  surface?: PanelSurface;
  /** true の間は Esc でパネルを閉じない（メニューが開いているときなど） */
  holdEsc?: boolean;
  /** 全プロジェクトのボードでは、新しいチャットのプロジェクトを選べるようにする */
  projects?: Project[];
  /** 新しいチャットができたとき（URL をそのチャットにするなど） */
  onCreated?: (chat: Chat) => void;
}

export type PanelController = ReturnType<typeof usePanel>;

/**
 * ボードの右側から出てくるパネル（チャット・新しいチャット・ブラウザのタブ）の状態と操作。カンバンとグループのボードで共通。
 * タブは上下・左右のペインに分けて並べられる（配置は paneLayout の木。自分で開くタブはピントのあるペインに、
 * サイドバーと連動して自動で足すチャットのタブは一覧のペイン（homePane。分けた元のペイン）に入る）。
 * 表示は Panel（body の中の最後に置く）・PanelToggle（見出しの開閉ボタン）・DraftCards（列の下書き）で行う
 */
export function usePanel({ memoryKey, scope, surface = "board", holdEsc = false, projects, onCreated }: Options) {
  // 欄で表示するタブの種類（隠した種類のタブは閉じずに残す。隠している種類のタブを自分で開いたら、その種類を出す）
  const kinds = usePanelKinds(surface);
  // タブ・分割の配置・開閉・連動の覚え（ボードごとに覚え、切り替えたら戻す。usePanelState.ts）
  const { tabs, setTabs, layout, setLayout, changeLayout, activeTab, panelOpen, setPanelOpen, links, setLinks, current } = usePanelState(memoryKey);
  // サイドバーに出ているチャット（タブのチャットの状態・まとまりの数もこれで数える）
  const linked = useLinkedChats(scope);
  const chats = linked.chats;
  // 幅と横幅いっぱい（ボードを覆う）
  const size = usePanelWidth();

  /** タブを表示する（どこかのペインにあればそこで、なければピントのあるペインに足す）。ピントもそのペインへ */
  const reveal = (key: string) => {
    changeLayout((l) => placeTab(l, key));
    setPanelOpen(true);
  };
  /** 開いているタブを表示する（タブ・下書きを押したとき。ないタブなら何もしない） */
  const show = (key: string) => {
    if (tabs.some((t) => t.key === key)) reveal(key);
  };

  /**
   * 右側のパネルにタブで開く（開いていればそのタブへ）。ボードはその分狭くなる。
   * focus は検索結果から開いたときに、スクロールして強調する発言
   */
  const open = (chat: Pick<Chat, "id" | "project_id"> & Partial<Pick<Chat, "title">>, focus?: number) => {
    const key = chatKey(chat.id);
    const tab: PanelTab = { key, kind: "chat", id: chat.id, projectId: chat.project_id, focus, title: chat.title };
    kinds.show("chat");
    setTabs((prev) => (prev.some((t) => t.key === key) ? prev.map((t) => (t.key === key && focus ? tab : t)) : [...prev, tab]));
    // 表示だけ消していたチャットも、開けばまたタブに出す。サイドバーの一覧にないチャット（隠しているアーカイブ済みなど）は、閉じるまで残す
    setLinks((l) => {
      const dismissed = l.dismissed.filter((id) => id !== chat.id);
      const extra = scope !== null && !chats.some((r) => r.id === chat.id) && !l.extra.includes(chat.id) ? [...l.extra, chat.id] : l.extra;
      return dismissed.length === l.dismissed.length && extra === l.extra ? l : { dismissed, extra };
    });
    reveal(key);
  };

  /**
   * 新しいチャットのタブを開く（ボードや列・グループの＋、サイドバーの＋など）。
   * ブラウザ・ターミナルと同じく、押すたびに新しいタブを開く（書きかけの新しいチャットがあっても、もう 1 つ始められる）
   */
  const lastNew = useRef<{ target: string; key: string; at: number }>(undefined);
  const openNew = (target: NewChatTarget, seed?: NewChatSeed) => {
    // 同じ指定でほぼ同時に呼ばれたとき（開発時の effect の二重実行）だけ 1 つにまとめる（初めの入力があるものは利用者の操作なのでまとめない）
    const sig = `${target.projectId}:${target.group ?? ""}`;
    const recent = lastNew.current;
    const key = !seed && recent && recent.target === sig && Date.now() - recent.at < 100 ? recent.key : newTabKey("new");
    lastNew.current = { target: sig, key, at: Date.now() };
    const tab: PanelTab = { key, kind: "new", ...target, ...(seed ? { seed, draftText: seed.text } : {}) };
    kinds.show("chat");
    setTabs((prev) => (prev.some((t) => t.key === key) ? prev : [...prev, tab]));
    reveal(key);
  };

  /** サブエージェントの中身をタブで開く（同じサブエージェントのタブがあればそこへ） */
  const openSubagent = ({ chatId, projectId, toolUseId, title }: { chatId: number; projectId: number; toolUseId: string; title: string }) => {
    const key = `subagent:${chatId}:${toolUseId}`;
    kinds.show("chat");
    setTabs((prev) => (prev.some((t) => t.key === key) ? prev : [...prev, { key, kind: "subagent", chatId, projectId, toolUseId, title }]));
    reveal(key);
  };

  /** ブラウザの新しいタブを開く（url がなければ空のページで、アドレス欄に入力して開く） */
  const openBrowser = (url = "") => {
    const key = `browser:${Date.now()}`;
    kinds.show("browser");
    setTabs((prev) => [...prev, { key, kind: "browser", url, title: "" }]);
    reveal(key);
  };

  /** 内蔵ターミナルの新しいタブを開く（cwd のフォルダでシェルを始める） */
  const openTerminal = ({ cwd, label }: TerminalTarget) => {
    const key = newTabKey("terminal");
    kinds.show("terminal");
    setTabs((prev) => [...prev, { key, kind: "terminal", cwd, label }]);
    reveal(key);
  };

  /** タブの中身を変える（新しいチャットのプロジェクト・グループ、ブラウザのタイトルなど） */
  const updateTab = (key: string, update: (tab: PanelTab) => PanelTab) => setTabs((prev) => prev.map((t) => (t.key === key ? update(t) : t)));

  /** 新しいチャットを送ったら、そのタブをできたチャットのタブに置き換える（同じペインの同じ位置のまま） */
  const replaceWithChat = (key: string, chat: Chat) => {
    const tab: PanelTab = { key: chatKey(chat.id), kind: "chat", id: chat.id, projectId: chat.project_id, title: chat.title };
    updateTab(key, () => tab);
    changeLayout((l) => renameTab(l, key, tab.key));
    onCreated?.(chat);
  };

  const close = () => setPanelOpen(false);
  const reopen = () => setPanelOpen(true);

  /**
   * タブを閉じる。表示中のタブならそのペインの隣のタブへ。空になったペインは消し、見せている最後のタブならパネルも閉じる。
   * ターミナルはシェルも止める。base はペインを閉じたあとの配置など、閉じる前に変えておいた配置。
   * dismiss: 利用者が閉じた（表示だけ消す）チャットは、サイドバーとの連動で出し直さないよう覚える（アーカイブ・削除で閉じるときは覚えない）
   */
  const closeMany = (keys: string[], base: PaneLayout = layout, dismiss = true) => {
    const closing = new Set(keys);
    const closedChats = tabs.flatMap((t) => (closing.has(t.key) && t.kind === "chat" ? [t.id] : []));
    if (closedChats.length > 0)
      setLinks((l) => ({
        dismissed: dismiss ? [...new Set([...l.dismissed, ...closedChats.filter((id) => chats.some((r) => r.id === id))])] : l.dismissed,
        extra: l.extra.filter((id) => !closedChats.includes(id)),
      }));
    for (const t of tabs) if (closing.has(t.key) && t.kind === "terminal") void window.kickoff?.terminal.close(t.key);
    // 次の状態は純粋関数で決め、state の更新は updater の外で行う（updater の中の副作用は StrictMode で 2 回走る）
    const nextTabs = tabs.filter((t) => !closing.has(t.key));
    if (nextTabs.length === tabs.length && base === layout) return;
    setTabs(nextTabs);
    setLayout(closeLayoutTabs(base, keys));
    // 見せているタブがなくなったらパネルも閉じる（隠した種類のタブ・連動したチャットのタブが残っていても）
    if (!nextTabs.some((t) => kinds.has(kindOfTab(t)))) setPanelOpen(false);
  };
  /** タブを閉じる（dismiss: false はアーカイブ・削除のあと。サイドバーに出ている間は連動でまた出る） */
  const closeTab = (key: string, { dismiss = true }: { dismiss?: boolean } = {}) => closeMany([key], layout, dismiss);
  // サイドバーの下書きから、このパネルのタブを表示する・閉じる・作成先のグループを変えるために登録する（いつも最新の関数を呼ぶ）
  const openerRef = useRef({ show, close: closeTab, update: updateTab });
  openerRef.current = { show, close: closeTab, update: updateTab };
  useEffect(
    () =>
      registerPanel(memoryKey, {
        show: (key) => openerRef.current.show(key),
        close: (key) => openerRef.current.close(key),
        update: (key, change) => openerRef.current.update(key, change),
      }),
    [memoryKey],
  );

  // 削除したチャットのタブ（そのチャットのサブエージェントのタブも）は閉じる（ボードのないチャット欄でも）
  useServerEvent((e) => {
    if (e.type !== "chat_deleted") return;
    const gone = tabs.filter((t) => t.key === chatKey(e.id) || (t.kind === "subagent" && t.chatId === e.id));
    if (gone.length > 0) closeMany(gone.map((t) => t.key), layout, false);
  });

  // チャットのタブをサイドバーの一覧にそろえる（一覧が届いてから。一覧から外れたタブは閉じ、まだないチャットはタブを足す）
  useEffect(() => {
    if (!linked.loaded || !current) return;
    const next = syncLinkedTabs(tabs, chats, links);
    if (next.links !== links) setLinks(next.links);
    if (next.tabs === tabs) return;
    const kept = new Set(next.tabs.map((t) => t.key));
    const gone = tabs.filter((t) => !kept.has(t.key));
    setTabs(next.tabs);
    if (gone.length > 0) setLayout((l) => closeLayoutTabs(l, gone.map((t) => t.key)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chats, linked.loaded, links, current, memoryKey]);

  // Esc でパネルを閉じる（メニューやダイアログが開いていればそちらを優先）
  useWindowEvent(
    "keydown",
    (e) => {
      if (e.key === "Escape" && !holdEsc && !document.querySelector("dialog[open]")) close();
    },
    panelOpen,
  );

  /** パネルでこのタブを見せているか（分割していれば、どれかのペインで表示中） */
  const isShowingTab = (key: string) => panelOpen && isTabVisible(layout, key);

  /** サイドバーに出ているチャットのタブか（連動しない欄では runs が空なので、いつも false） */
  const isLinkedTab = (key: string) => {
    const t = tabs.find((x) => x.key === key);
    return t?.kind === "chat" && chats.some((r) => r.id === t.id);
  };

  /** そのタブの種類をこの欄で見せているか */
  const isKindShown = (key: string) => {
    const t = tabs.find((x) => x.key === key);
    return t !== undefined && kinds.has(kindOfTab(t));
  };

  return {
    tabs,
    surface,
    /** 表示するタブの種類（タブの列の「表示するタブ」） */
    kinds,
    isKindShown,
    activeTab,
    /** 分割の配置（直したもの） */
    layout,
    /** サイドバーと連動しているか（連動した欄では、一覧のペインにだけチャットのタブを自動で足す） */
    linked: scope !== null,
    panelOpen,
    /** パネルが横幅いっぱいに見えているか（横幅いっぱいにした・横に残るボードが狭すぎてボードを覆っている） */
    panelFull: size.maximized || size.covering,
    /** 元の幅に戻せるか（覆っていて、ボードを残すとパネルの最小の幅に足りないほど狭いときは戻せない） */
    canRestoreWidth: size.canRestore,
    chats,
    /** アーカイブ済みのチャットもタブに出しているか（サイドバーと共通） */
    showArchived: linked.showArchived,
    projects,
    open,
    openNew,
    openBrowser,
    openTerminal,
    openSubagent,
    /** タブを表示する（タブ・下書きを押したとき） */
    showTab: show,
    closeTab,
    /** タブを一覧のペインへ戻す（分けたペインで、サイドバーと連動したチャットのタブを閉じたとき。表示だけ消したことにはしない） */
    returnToHome: (key: string) => changeLayout((l) => returnToHome(l, key)),
    /** サイドバーに出ているチャットのタブか（ペインを閉じても一覧のペインへ戻すもの） */
    isLinkedTab,
    updateTab,
    replaceWithChat,
    close,
    toggle: () => (panelOpen ? close() : reopen()),
    toggleMaximized: size.toggleMaximized,
    /** パネル（aside）に付ける（左端のつまみのドラッグを始めたときの幅を測る） */
    paneRef: size.paneRef,
    resizeHandle: size.resizeHandle,
    // ペインを閉じても、サイドバーに出ているチャットのタブは閉じずに一覧のペインへ戻す（表示だけ消したことにしない）
    ...paneActions(layout, changeLayout, closeMany, isLinkedTab),
    /** 送る前の新しいチャットのタブ（ボードの列・グループに下書きとして出す） */
    drafts: tabs.flatMap((t) =>
      t.kind === "new" ? [{ key: t.key, text: t.draftText ?? "", target: { projectId: t.projectId, group: t.group } }] : [],
    ),
    isShowingTab,
    /** パネルでこのチャットを表示しているか（カードを選択中として見せる。分割していれば、どれかのペインで） */
    isShowing: (chatId: number) => isShowingTab(chatKey(chatId)),
    /** ボードとパネルを並べる要素に渡す */
    body: {
      ref: size.bodyRef,
      // 覆っているときは間隔を消す（ドラッグ中は指の位置どおりの幅にするので付けない）
      className: cx("board-body", panelOpen && "with-panel", (size.maximized || size.covering) && !size.resizing && "panel-full", size.resizing && "resizing", size.stretching && "stretching"),
      style: size.style,
    },
  };
}
