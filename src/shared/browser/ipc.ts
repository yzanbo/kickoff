// 埋め込みブラウザの IPC の取り決め（window.kickoff の browser・devtools・agentBrowser・browserExtensions。処理は src/features/browser/desktop/）。
// 表の部品と中身の型は @shared/foundation/ipc。全部を並べるのは src/app/shared/ipc.ts
import { event, invoke, send, type BrowserExtensionInfo, type BrowserHandOffCapture, type DevtoolsBounds, type IpcTable, type KnownExtensionKey } from "@shared/foundation/ipc";

export const BROWSER_IPC = {
  /** 埋め込みブラウザ（<webview>）のページ内検索・右クリックの操作 */
  browser: {
    /** ページの中で ⌘F が押された（その WebContents の ID） */
    onFindRequested: event<[webContentsId: number]>(),
    /** 右クリックした場所の画像をコピーする。座標は webview が知らせた値 */
    copyImageAt: invoke<[webContentsId: number, x: number, y: number]>(),
  },
  /** 埋め込みブラウザ（<webview>）の開発者ツール。targetId・devtoolsId は埋め込みブラウザの WebContents の ID */
  devtools: {
    /** 開発者ツールを、呼んだ画面のウィンドウに重ねた表示（WebContentsView）の中に出す（右・下に並べる。置き場所は bounds） */
    openIn: invoke<[targetId: number, bounds: DevtoolsBounds, inspect?: { x: number; y: number }]>(),
    /** 右・下に並べた開発者ツールの置き場所を変える（null は隠す。タブが裏にある・メニューなどが上に重なるとき） */
    place: invoke<[targetId: number, bounds: DevtoolsBounds | null]>(),
    /** 右・下に並べた開発者ツールの見た目を撮る（隠している間に代わりに見せる。JPEG の data URL。撮れなければ null） */
    snapshot: invoke<[targetId: number], string | null>(),
    /** 開発者ツールを、別のウィンドウで開く */
    openWindow: invoke<[targetId: number, inspect?: { x: number; y: number }]>(),
    /** 開発者ツールを閉じる（別のウィンドウも） */
    close: invoke<[targetId: number]>(),
    /** 開発者ツールの別のウィンドウを、利用者が閉じた */
    onWindowClosed: event<[targetId: number]>(),
  },
  /**
   * AI（チャットのエージェント）による埋め込みブラウザの操作（src/features/browser/desktop/agent/）。
   * 画面のブラウザのタブは webview の準備ができたら登録し、AI が新しいタブを開くときはメインが画面に頼む
   */
  agentBrowser: {
    /** ブラウザのタブの webview を登録する（webContentsId: その WebContents の ID / tabKey: パネルのタブのキー / projectId: どのプロジェクトのパネルか） */
    register: send<[webContentsId: number, tabKey: string, projectId: number | null]>(),
    /** タブを閉じた */
    unregister: send<[webContentsId: number]>(),
    /** 開く頼み（onOpenRequest）の返事（足したタブのキー・表に出したか。開けなければ null と理由） */
    opened: send<[requestId: number, tabKey: string | null, revealed: boolean, error: string | null]>(),
    /**
     * AI が新しいタブを開く: そのプロジェクトのチャット欄にブラウザのタブを足して opened で返す。reveal なら欄を開いて表に出す
     * （after は、この作業で前に表に出したタブのキー。あれば、利用者がまだそれを見ているときだけ表に出す）。キーボードのピントは動かさない
     */
    onOpenRequest: event<[requestId: number, projectId: number, url: string, reveal: boolean, after: string | null]>(),
    /** 表に出す頼み（onRevealRequest）の返事（表に出したか） */
    revealed: send<[requestId: number, shown: boolean]>(),
    /** AI が作業の初めにタブを使う: そのタブのある欄を開いて表示中にし、revealed で返す（after は onOpenRequest と同じ。キーボードのピントは動かさない） */
    onRevealRequest: event<[requestId: number, tabKey: string, after: string | null]>(),
    /** AI がタブを操作している・しばらく操作していない（タブに「AI 操作中」の印を出す・消す） */
    onActivity: event<[tabKey: string, active: boolean]>(),
    /** タブの「AI に渡す」: 見えている範囲の画面と、覚えているコンソールのエラー・警告を取る（webContentsId はそのタブの webview） */
    handOffCapture: invoke<[webContentsId: number], BrowserHandOffCapture>(),
  },
  /** 埋め込みブラウザの拡張機能（React DevTools など）。どれも、そのあとの一覧を返す */
  browserExtensions: {
    /** 保存してある拡張機能（読み込めなかったものも） */
    list: invoke<[], BrowserExtensionInfo[]>(),
    /** よく使う拡張機能を Chrome ウェブストアから取得する（Chrome から写した同じものは消す） */
    install: invoke<[key: KnownExtensionKey], BrowserExtensionInfo[]>(),
    /** よく使う拡張機能を、Chrome にインストール済みのものから写す（ウェブストアから取った同じものは消す） */
    importFromChrome: invoke<[key: KnownExtensionKey], BrowserExtensionInfo[]>(),
    /** 展開済みの拡張機能のフォルダを選んで読み込む */
    addFolder: invoke<[], BrowserExtensionInfo[]>(),
    /** 消す（取得・写したものはフォルダごと消す。フォルダを指定したものは一覧から外すだけで、フォルダは残す） */
    remove: invoke<[path: string], BrowserExtensionInfo[]>(),
  },
} satisfies IpcTable;

type BrowserIpc = typeof BROWSER_IPC;
declare module "@shared/foundation/ipc/contract" {
  interface IpcTableMap extends BrowserIpc {}
}
