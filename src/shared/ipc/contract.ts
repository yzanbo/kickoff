// Electron の IPC の取り決め: 画面に出すネイティブ機能（window.kickoff）の一覧。まとまり・名前・種類・引数・戻り値・知らせの形を
// ここ 1 か所で決め、チャンネル名もここから作る（channelOf）。preload はこの表から window.kickoff を作り（preload/nativeApi.ts）、
// メインはこの表の型どおりに登録する（main/ipc/register.ts）。名前や形が食い違えば typecheck で分かる。
// 値は種類だけ（zod・Electron・Node に依存しない。サンドボックスの preload にも束ねるため）
import type { BrowserExtensionInfo, KnownExtensionKey } from "./browserExtensions";
import type { BrowserHandOffCapture } from "./browserHandOff";
import type { DiagnosticsFolders, DiagnosticsState } from "./diagnostics";
import type { ExternalBrowserId, ExternalTerminalId } from "./externalApps";
import type { NotifyRequest, NotifyResult } from "./notifications";
import type { TerminalOpenResult } from "./terminal";

/** 呼び方の種類: invoke = 画面から呼んで返事を待つ / send = 画面から送るだけ（返事なし） / event = メインから画面への知らせ */
export type IpcKind = "invoke" | "send" | "event";

/** 型だけを運ぶ印（実体はない） */
declare const types: unique symbol;

/** 画面から呼んで、返事（戻り値）を待つもの（ipcRenderer.invoke ↔ ipcMain.handle） */
export interface InvokeSpec<A extends unknown[] = unknown[], R = unknown> {
  readonly kind: "invoke";
  readonly [types]?: { args: A; result: R };
}

/** 画面から送るだけのもの（ipcRenderer.send ↔ ipcMain.on）。細かく何度も届くもの（ターミナルの入力など） */
export interface SendSpec<A extends unknown[] = unknown[]> {
  readonly kind: "send";
  readonly [types]?: { args: A };
}

/** メインから画面への知らせ（webContents.send ↔ ipcRenderer.on）。画面の名前は on… */
export interface EventSpec<A extends unknown[] = unknown[]> {
  readonly kind: "event";
  readonly [types]?: { args: A };
}

type Spec = InvokeSpec | SendSpec | EventSpec;

// 型の引数は必ず書く（省くと、表の型（satisfies）から unknown[] と推論されてしまう）
const invoke = <A extends unknown[], R = void>(): InvokeSpec<A, R> => ({ kind: "invoke" });
const send = <A extends unknown[]>(): SendSpec<A> => ({ kind: "send" });
const event = <A extends unknown[]>(): EventSpec<A> => ({ kind: "event" });

/** フォルダを選ぶ窓の文（message: 窓の上に出す説明。省けば title / buttonLabel: 決めるボタンの名前 / defaultPath: 初めに開くフォルダ） */
export interface PickFolderOptions {
  message?: string;
  buttonLabel?: string;
  defaultPath?: string;
}

/** 画面に出すネイティブ機能の一覧（まとまり → 名前）。デスクトップアプリでだけある（スマホのブラウザでは window.kickoff がない） */
export const NATIVE_API = {
  /** ネイティブのダイアログ */
  dialog: {
    /** フォルダを 1 つ選ぶ（やめたら null）。macOS の窓は title を出さないので、何のために選ぶかは options.message（窓の上の文）と buttonLabel で伝える */
    pickFolder: invoke<[title?: string, options?: PickFolderOptions], string | null>(),
    /** 参照資料にするフォルダ・ファイルを選ぶ（複数可。やめたら空） */
    pickReferences: invoke<[], string[]>(),
  },
  /** Kickoff の画面の一部（チャットの画面の右の欄の変更・ファイル・サブエージェント）を、別のウィンドウで開く */
  windows: {
    /** 画面の route（"/popout/…" で始まる URL のハッシュ）を、別のウィンドウで開く。同じものがもう開いていれば、それを前に出す */
    openPopout: invoke<[route: string, title: string]>(),
    /** メインのウィンドウを前に出す（別ウィンドウから、メインの会話のその場所へ移る・チャット欄に入れるとき） */
    focusMain: invoke<[]>(),
    /** 呼んだ別ウィンドウを、閉じ方を聞かずに閉じる（子チャットのウィンドウの最小化・閉じ方を選んだあと・右の欄に戻すとき） */
    closeSelf: invoke<[]>(),
    /** ✕・⌘W で閉じようとした（子チャットのウィンドウ。メインプロセスが閉じるのを止めて知らせ、画面が閉じ方を聞く） */
    onCloseRequested: event<[]>(),
  },
  /** アプリの外で開く（Finder・VS Code・外部のターミナル・ブラウザ） */
  externalApps: {
    /** ファイル・フォルダを既定のアプリで開く（フォルダは Finder） */
    openPath: invoke<[path: string]>(),
    /** ファイル・フォルダを Finder で表示する（入っているフォルダを開いて選ぶ） */
    revealPath: invoke<[path: string]>(),
    /** VS Code でファイル・フォルダを開く（line があればその行へ） */
    openInVSCode: invoke<[path: string, line?: number]>(),
    /** この Mac に入っている外部のターミナル */
    terminals: invoke<[], ExternalTerminalId[]>(),
    /** 外部のターミナル（省くと Terminal.app）で、そのフォルダを開く */
    openTerminal: invoke<[dir: string, terminal?: ExternalTerminalId]>(),
    /** この Mac に入っている外部のブラウザ */
    browsers: invoke<[], ExternalBrowserId[]>(),
    /** 外部のブラウザ（省くと Chrome）でページを開く（url がない・http(s) でなければアプリを開くだけ） */
    openBrowser: invoke<[url?: string, browser?: ExternalBrowserId]>(),
  },
  /** 埋め込みブラウザ（<webview>）の開発者ツール。targetId・devtoolsId は埋め込みブラウザの WebContents の ID */
  devtools: {
    /** 開発者ツールを、同じ画面の別の埋め込みブラウザの中に表示する（右・下に並べる） */
    openIn: invoke<[targetId: number, devtoolsId: number]>(),
    /** 開発者ツールを、別のウィンドウで開く */
    openWindow: invoke<[targetId: number]>(),
    /** 開発者ツールを閉じる（別のウィンドウも） */
    close: invoke<[targetId: number]>(),
    /** 開発者ツールの別のウィンドウを、利用者が閉じた */
    onWindowClosed: event<[targetId: number]>(),
  },
  /**
   * AI（チャットのエージェント）による埋め込みブラウザの操作（main/browser/agentBrowser.ts）。
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
    list: invoke<[], BrowserExtensionInfo[]>(),
    /** よく使う拡張機能を Chrome ウェブストアから取得する */
    install: invoke<[key: KnownExtensionKey], BrowserExtensionInfo[]>(),
    /** よく使う拡張機能を、Chrome にインストール済みのものから写す */
    importFromChrome: invoke<[key: KnownExtensionKey], BrowserExtensionInfo[]>(),
    /** 展開済みの拡張機能のフォルダを選んで読み込む */
    addFolder: invoke<[], BrowserExtensionInfo[]>(),
    /** 外す（取得・写したものはフォルダも消す） */
    remove: invoke<[path: string], BrowserExtensionInfo[]>(),
  },
  /** 内蔵ターミナル（パネルのタブ）。key はタブごとのキー */
  terminal: {
    /** シェルにつなぐ（なければ cwd で始める） */
    open: invoke<[key: string, cwd: string, cols: number, rows: number], TerminalOpenResult>(),
    /** キー入力 */
    write: send<[key: string, data: string]>(),
    resize: send<[key: string, cols: number, rows: number]>(),
    /** シェルを止める（タブを閉じたとき） */
    close: invoke<[key: string]>(),
    /** シェルの出力 */
    onData: event<[key: string, data: string]>(),
    /** シェルが終わった */
    onExit: event<[key: string, exitCode: number]>(),
  },
  /** Mac の通知 */
  notifications: {
    /** 通知を出す（chat を渡すと、押したときにそのチャットを開く）。届かなかったら理由を返す */
    notify: invoke<[request: NotifyRequest], NotifyResult>(),
    /** Mac の「システム設定 → 通知」を開く（Kickoff の通知を許可する・出し方を変える） */
    openSettings: invoke<[]>(),
    /** Dock のアイコンの赤い数字（要対応のチャットの数。0 なら消す） */
    setBadge: send<[count: number]>(),
    /** 通知が押されて、そのチャットを開くとき（Kickoff を起動し直したあとに、前の通知が押されたときも） */
    onOpenChat: event<[projectId: number, chatId: number]>(),
  },
  /** 性能の記録（重いときに、その場で 10 秒の記録を取って保存する。メニューの「ヘルプ」からも始まる） */
  diagnostics: {
    start: invoke<[]>(),
    /** 保存先と最近の記録のフォルダ（新しい順） */
    folders: invoke<[], DiagnosticsFolders>(),
    /** 保存先を Finder で開く（まだなければ作る） */
    openRoot: invoke<[]>(),
    /** 記録の様子（記録中・保存中・保存した・失敗） */
    onState: event<[state: DiagnosticsState]>(),
  },
} satisfies Record<string, Record<string, Spec>>;

type Api = typeof NATIVE_API;

/** まとまり（window.kickoff の 1 段目） */
export type IpcGroup = keyof Api;
/** まとまりの中の名前 */
export type IpcMethod<G extends IpcGroup> = keyof Api[G] & string;
/** まとまりの中の、その種類の名前 */
export type IpcMethodOf<G extends IpcGroup, K extends IpcKind> = { [M in IpcMethod<G>]: Api[G][M] extends { kind: K } ? M : never }[IpcMethod<G>];
/** 表の 1 項目の型 */
export type IpcSpec<G extends IpcGroup, M extends IpcMethod<G>> = Api[G][M];
/** 引数の型（invoke・send は画面が渡すもの、知らせはメインが渡すもの） */
export type IpcArgs<S> = S extends { readonly [types]?: { args: infer A extends unknown[] } } ? A : never;

/** 画面の側の関数: invoke は Promise を返す・send は何も返さない・知らせは受け取る関数を渡し、受け取りをやめる関数を返す */
type ClientOf<S> =
  S extends InvokeSpec<infer A, infer R>
    ? (...args: A) => Promise<R>
    : S extends SendSpec<infer A>
      ? (...args: A) => void
      : S extends EventSpec<infer A>
        ? (listener: (...args: A) => void) => () => void
        : never;

/** 画面に出すネイティブ機能（window.kickoff）の型 */
export type NativeApi = { [G in keyof Api]: { [M in keyof Api[G]]: ClientOf<Api[G][M]> } };

/** 表の 1 項目（まとまり・名前・種類と、そのチャンネル名） */
export interface IpcEntry {
  group: string;
  method: string;
  kind: IpcKind;
  channel: string;
}

const table = NATIVE_API as Record<string, Record<string, Spec>>;

/** チャンネル名の作り方: 「種類:まとまり.名前」（invoke:terminal.open・send:terminal.write・event:terminal.onData） */
const channelName = (kind: IpcKind, group: string, method: string) => `${kind}:${group}.${method}`;

/** 表の項目のチャンネル名（ほかで手書きしない） */
export function channelOf<G extends IpcGroup>(group: G, method: IpcMethod<G>): string {
  return channelName(table[group][method].kind, group, method);
}

/** 表のすべての項目（preload が window.kickoff を作る・メインが登録する・テストで突き合わせる） */
export function ipcEntries(): IpcEntry[] {
  return Object.entries(table).flatMap(([group, methods]) =>
    Object.entries(methods).map(([method, { kind }]) => ({ group, method, kind, channel: channelName(kind, group, method) })),
  );
}
