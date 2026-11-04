import { lazy, Suspense, type CSSProperties } from "react";
import { cx } from "@/lib/cx";
import { BrowserPane } from "@/features/browser/BrowserPane";
import { ChatPane } from "@/features/chat/pane/ChatPane";
import { NewChatContext } from "@/features/chat/queue/askInNewChat";
import { SubagentPane } from "@/features/chat/subagents/SubagentPane";
import { NewChatPane } from "./NewChatPane";
import type { PanelTab, PanelController } from "@/features/panel/usePanel";

// xterm.js は、ターミナルのタブを開いたときだけ読み込む
const TerminalPane = lazy(() => import("@/features/terminal/TerminalPane"));

/**
 * パネルの 1 つのタブの中身（チャット・新しいチャット・サブエージェント・ターミナル・ブラウザ）。
 * タブを切り替えても入力中の文章やスクロール位置が残るよう、表示していないタブも hidden で残す。
 * ペインを分けても作り直さない（webview・ターミナル・入力中の文を保つ）よう、どのタブもパネルの中身の直下に置き、
 * 分けているときは style でそのペインの位置に重ねる。押す・ピントが入るとそのペインにピントを移す
 */
export function PanelTabPage({
  tab: t,
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
  const visible = panelOpen && active;
  const focus = () => panel.focusPane(paneId);
  return (
    <div className={cx("panel-tab-page", split && focused && "pane-focused")} hidden={!active} style={style} onPointerDownCapture={focus} onFocusCapture={focus}>
      {t.kind === "chat" ? (
        // 送信待ちの指示を新しいチャットで聞くときは、このパネルに新しいチャットのタブを開く
        <NewChatContext.Provider value={panel.openNew}>
        <ChatPane
          projectId={t.projectId}
          chatId={t.id}
          focus={t.focus}
          visible={visible}
          onOpenSubagent={(toolUseId, title) => panel.openSubagent({ chatId: t.id, projectId: t.projectId, toolUseId, title })}
          // 移したチャットは、移した先のプロジェクトのものとして扱う（projectId も合わせる）
          onChatChange={(chat) =>
            panel.updateTab(t.key, (x) =>
              x.kind === "chat" && x.chat !== chat
                ? { ...x, title: chat.title, status: chat.status, unread: chat.unread, projectId: chat.project_id, chat }
                : x,
            )
          }
        />
        </NewChatContext.Provider>
      ) : t.kind === "new" ? (
        <NewChatPane
          projectId={t.projectId}
          group={t.group}
          seed={t.seed}
          draftText={t.draftText}
          visible={visible}
          projects={panel.projects}
          onProjectChange={(projectId) => panel.updateTab(t.key, () => ({ ...t, projectId, group: undefined, groupName: undefined }))}
          onGroupChange={(group, groupName) => panel.updateTab(t.key, (x) => (x.kind === "new" ? { ...x, group, groupName } : x))}
          onCreated={(chat) => panel.replaceWithChat(t.key, chat)}
          onDraftChange={(text) => panel.updateTab(t.key, (x) => (x.kind === "new" && (x.draftText ?? "") !== text ? { ...x, draftText: text } : x))}
        />
      ) : t.kind === "subagent" ? (
        <SubagentPane
          projectId={t.projectId}
          chatId={t.chatId}
          toolUseId={t.toolUseId}
          onOpenSubagent={(toolUseId, title) => panel.openSubagent({ chatId: t.chatId, projectId: t.projectId, toolUseId, title })}
        />
      ) : t.kind === "terminal" ? (
        <Suspense fallback={<div className="page muted">読み込み中…</div>}>
          <TerminalPane termKey={t.key} cwd={t.cwd} visible={visible} focused={visible && focused} onOpenUrl={(url) => panel.openBrowser(url)} />
        </Suspense>
      ) : (
        <BrowserPane
          url={t.url}
          onChange={({ url, title }) =>
            // 空のページのあいだは「新しいタブ」と表示する
            panel.updateTab(t.key, (x) => (x.kind === "browser" ? { ...x, title: url === "about:blank" ? "" : title, current: url } : x))
          }
        />
      )}
    </div>
  );
}
