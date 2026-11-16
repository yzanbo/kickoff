// ウィンドウの間の知らせ（メインのウィンドウと別ウィンドウ。同じ出どころなので BroadcastChannel で届く）
import type { Attachment, GitHubLink } from "@shared/types";
import type { Workplace } from "@/features/worktree/WorkplacePicker";
import type { SplitDir } from "@/features/panel/layout/paneTree";
import type { DraftRef } from "@/features/panel/state/panelDrafts";
import type { PanelState } from "@/features/panel/state/panelState";
import type { PopoutRoute } from "./popout";
import type { FileTarget } from "./router";

export type WindowMessage =
  /** メインのウィンドウのそのチャットのチャット欄の後ろに足す（別ウィンドウの差分の行・返答へのコメント・メモの添付） */
  | { type: "fillComposer"; chatId: number; text: string; attachments?: Attachment[] }
  /** メインのウィンドウのそのチャットの会話のその場所へ移る（agent があれば、そのサブエージェントを設定の開き方で開いてその中へ） */
  | { type: "reveal"; chatId: number; eventId?: number; agent: string | null }
  /** メインのウィンドウのそのチャットの「動き」を、そのサブエージェントに絞って開く */
  | { type: "showActivity"; chatId: number; agent: string }
  /** メインのウィンドウでファイルタブのファイルを開く */
  | { type: "openProjectFile"; projectId: number; file: FileTarget }
  /** メインのウィンドウでそのメモを開く（chatId があればそのチャットの右の欄、なければメモのタブ。別ウィンドウの返答から「メモに追加」したとき） */
  | { type: "openMemo"; projectId: number; path: string; chatId: number | null }
  /** メインのウィンドウでチャットを開く（別ウィンドウの DB クライアントの「AI に聞く」で作ったチャット・聞いたチャット） */
  | { type: "openChat"; projectId: number; chatId: number }
  /** メインのウィンドウのプロジェクトのチャットのパネルに、文と添付を入れた新しいチャットのタブを開く（別ウィンドウの「AI に渡す」の「新しいチャットで始める」。openSeededChat） */
  | { type: "openSeededChat"; projectId: number; place: Workplace; text: string; attachments: Attachment[]; link: GitHubLink | null }
  /** メインのウィンドウで子チャットを開く（設定が右の欄のとき。別ウィンドウの子チャットの札・通知から） */
  | { type: "openChild"; chatId: number }
  /** メインのウィンドウで、そのチャットの新しい子チャットのタブを開く（別ウィンドウの「新しい子チャットで聞く」「子チャットを作成」。openAskChild） */
  | { type: "askChild"; parentId: number; eventId: number | null; quote: string; text?: string; attachments?: Attachment[] }
  /** 別ウィンドウの中身を、メインのウィンドウのチャットの画面の右の欄（チャット欄・パネルのタブは元の欄）で開き直す（別ウィンドウの「右の欄に戻す」。開き直したら docked） */
  | { type: "dockPopout"; route: PopoutRoute }
  /** dockPopout で開き直し終えた（key は popoutKey。別ウィンドウはこれを待ってから閉じる。ターミナルの持ち主をメインのウィンドウに移してから閉じるため） */
  | { type: "docked"; key: string }
  /** 別ウィンドウの子チャットから親へ: 親の聞いた位置を見る（reveal）/ 答えを親の入力欄に入れる（handBack） */
  | { type: "childToParent"; childId: number; action: "reveal" | "handBack"; text?: string }
  /** もう開いている別ウィンドウの「変更」を、そのファイルの位置へ移す（key は popoutKey） */
  | { type: "popoutFocus"; key: string; focus: string }
  /** メインのウィンドウでその画面（URL のハッシュ）を開く（別ウィンドウの中のリンク・サイドバーの行。app/popoutNavigation.ts） */
  | { type: "navigate"; hash: string }
  /** メインのウィンドウの App が受けるダイアログ・一覧を開く（別ウィンドウの中から開いた設定・⌘⇧A・新しいプロジェクトなど。app/popoutNavigation.ts の FORWARDED_APP_EVENTS） */
  | { type: "appEvent"; name: string; detail: unknown }
  /** サイドバーの別ウィンドウを開いた / 閉じた（開いている間、メインのウィンドウは画面とパネルの状態を写して送る） */
  | { type: "sidebarWindow"; open: boolean }
  /** メインのウィンドウが起動した（読み込み直した）。サイドバーの別ウィンドウは sidebarWindow を送り直す */
  | { type: "mainWindowReady" }
  /** メインのウィンドウのいまの画面（サイドバーの別ウィンドウが、開いているチャット・プロジェクトを強調するのに使う） */
  | { type: "mainRoute"; hash: string }
  /** メインのウィンドウのパネルの状態の写し（サイドバーの別ウィンドウの下書きの行・子チャットの行の「開いている」見た目） */
  | { type: "mainPanels"; panels: [string, PanelState][] }
  /**
   * チャット欄の別ウィンドウを開いた / 閉じた（開いたら、メインのウィンドウはチャット欄の状態を取り出して sidePanels で渡し、自分のチャット欄を隠す。
   * holding: 別ウィンドウがもう状態を持っている（メインのウィンドウを読み込み直したとき。渡さずに、メインのウィンドウに戻した下書きの写しを捨てる））
   */
  | { type: "sideWindow"; open: boolean; holding: boolean }
  /** メインのウィンドウから渡したチャット欄の状態（すべてのプロジェクトの分。タブの後始末はしていない） */
  | { type: "sidePanels"; panels: [string, PanelState][] }
  /** メインのウィンドウから、チャット欄の別ウィンドウにブラウザのタブを開くよう頼む（ターミナルの ⌘ クリック・ポート・Docker などの「ブラウザで開く」） */
  | { type: "sideOpenBrowser"; panel: string; url: string }
  /** ブラウザのタブをほかのウィンドウへドラッグで移した（元の欄はそのタブを後始末なしで閉じる。features/panel/layout/browserTabTransfer.ts） */
  | { type: "tabMovedOut"; panel: string; key: string }
  /** チャット欄の別ウィンドウから戻すチャット欄の状態（open: メインのウィンドウのチャット欄を開くか。戻し終えたら docked） */
  | { type: "returnSidePanels"; panels: [string, PanelState][]; open: boolean }
  /** サイドバーの別ウィンドウからの、メインのウィンドウのパネルを変える操作（下書き・チャットを分けて開く） */
  | { type: "panelOp"; op: PanelOp };

/** 別ウィンドウ（サイドバーなど）から頼む、メインのウィンドウのパネルを変える操作（app/mainWindowMessages.ts が受ける） */
export type PanelOp =
  | { op: "openDraft"; draft: DraftRef }
  | { op: "openDraftSplit"; draft: DraftRef; dir: SplitDir }
  | { op: "setDraftTitle"; draft: DraftRef; title: string }
  | { op: "moveDraftToProject"; draft: DraftRef; projectId: number }
  | { op: "setDraftGroup"; draft: DraftRef; group: number | undefined; groupName: string | undefined }
  | { op: "togglePinDraft"; draft: DraftRef; pinned: boolean }
  | { op: "discardDraft"; draft: DraftRef }
  | { op: "openChatSplit"; chat: { id: number; project_id: number }; dir: SplitDir }
  /** その欄にブラウザのタブを開く（別ウィンドウのターミナルで ⌘ を押しながら押した URL） */
  | { op: "openBrowser"; panel: string; url: string };

// 画面（ブラウザ）の中だけで作る（テストの Node で作ると、開いたままで終わらなくなる）
const channel = typeof window === "undefined" || typeof BroadcastChannel === "undefined" ? undefined : new BroadcastChannel("kickoff-windows");
const listeners = new Set<(message: WindowMessage) => void>();
channel?.addEventListener("message", (e: MessageEvent<WindowMessage>) => {
  for (const listener of [...listeners]) listener(e.data);
});

/** ほかのウィンドウに知らせる（自分のウィンドウには届かない） */
export function postWindowMessage(message: WindowMessage) {
  channel?.postMessage(message);
}

/** メインのウィンドウに知らせて、前に出す（別ウィンドウから、メインの会話・チャット欄・ファイルタブを動かすとき） */
export function postToMainWindow(message: WindowMessage) {
  postWindowMessage(message);
  void window.kickoff?.windows.focusMain();
}

/** ほかのウィンドウからの知らせを受け取る（やめるときは返り値を呼ぶ） */
export function subscribeWindowMessages(listener: (message: WindowMessage) => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
