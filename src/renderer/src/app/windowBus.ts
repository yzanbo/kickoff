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
  /** 別ウィンドウの中身を、メインのウィンドウのチャットの画面の右の欄で開き直す（別ウィンドウの「右の欄に戻す」。別ウィンドウは閉じる） */
  | { type: "dockPopout"; route: PopoutRoute }
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
  /** サイドバーの別ウィンドウからの、メインのウィンドウのパネルを変える操作（下書き・チャットを分けて開く） */
  | { type: "panelOp"; op: PanelOp };

/** サイドバーの別ウィンドウから頼む、メインのウィンドウのパネルを変える操作（features/panel/state/panelOps.ts が受ける） */
export type PanelOp =
  | { op: "openDraft"; draft: DraftRef }
  | { op: "openDraftSplit"; draft: DraftRef; dir: SplitDir }
  | { op: "setDraftTitle"; draft: DraftRef; title: string }
  | { op: "moveDraftToProject"; draft: DraftRef; projectId: number }
  | { op: "setDraftGroup"; draft: DraftRef; group: number | undefined; groupName: string | undefined }
  | { op: "togglePinDraft"; draft: DraftRef; pinned: boolean }
  | { op: "discardDraft"; draft: DraftRef }
  | { op: "openChatSplit"; chat: { id: number; project_id: number }; dir: SplitDir };

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
