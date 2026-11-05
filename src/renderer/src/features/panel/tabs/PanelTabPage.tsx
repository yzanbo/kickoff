import { lazy, Suspense, type CSSProperties, type ReactNode } from "react";
import { cx } from "@/lib/cx";
import { BrowserPane } from "@/features/browser/BrowserPane";
import { ChatPane } from "@/features/chat/pane/ChatPane";
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
    />
  ),
  new: ({ tab: t, panel, visible }) => (
    <NewChatPane
      projectId={t.projectId}
      group={t.group}
      seed={t.seed}
      draftText={t.draftText}
      visible={visible}
      projects={panel.projects}
      onProjectChange={(projectId) => panel.patchTab(t.key, { kind: "new", fields: { projectId, group: undefined, groupName: undefined } })}
      onGroupChange={(group, groupName) => panel.patchTab(t.key, { kind: "new", fields: { group, groupName } })}
      onCreated={(chat) => panel.replaceWithChat(t.key, chat)}
      // 空の文は覚えない（書き始める前と同じ形のまま）
      onDraftChange={(text) => panel.patchTab(t.key, { kind: "new", fields: { draftText: text || undefined } })}
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
  return (
    <div className={cx("panel-tab-page", split && focused && "pane-focused")} hidden={!active} style={style} onPointerDownCapture={focus} onFocusCapture={focus}>
      <Page tab={tab} panel={panel} visible={panelOpen && active} focused={focused} />
    </div>
  );
}
