import { BrowserWindow, screen, type Rectangle } from "electron";
import type { IpcArgs, IpcGroup, IpcMethodOf, IpcSpec } from "@shared/foundation/ipc";
import { sendEvent, type IpcHandlers } from "@/foundation/desktop/ipc/register";
import { createAppWindow, mainWindow, showMainWindow } from "./window";

// 別ウィンドウ（チャットの画面の右の欄の変更・ファイル・サブエージェント・子チャットと左のサイドバーを、メインのウィンドウの外に出して見る。2 枚目の画面に置くなど）

/** 開いている別ウィンドウ（画面の route ごとに 1 つ。同じものを開こうとしたら前に出す） */
const popouts = new Map<string, BrowserWindow>();
/** 最後に閉じた（動かした）別ウィンドウの位置と大きさ（次に開くとき、少しずらして同じ大きさで開く。アプリを閉じるまで覚える） */
let lastBounds: Rectangle | undefined;
/** 別ウィンドウの種類ごとの違い（書いていない種類は、いつもの大きさ・webview なし・閉じ方を聞かない） */
interface PopoutLook {
  /** 欄ごとの別ウィンドウ（アプリに 1 つ）の初めの大きさと最小の幅。最後の位置と大きさは欄ごとに別に覚える（ほかの別ウィンドウより細いので、ほかに細さを写さない） */
  pane?: { width: number; height: number; minWidth: number };
  /** 埋め込みブラウザ（webview）を置く */
  webview?: true;
  /** ✕・⌘W で閉じるのを止めて画面に知らせる（子チャット = 閉じ方を聞く・右サイドバー = 状態をメインのウィンドウに戻してから閉じる） */
  asksBeforeClose?: true;
  /** 最小化（黄色）で Dock に入れず閉じる（子チャット = メインの会話の札に戻す。✕ と違い、閉じ方を聞かない） */
  closeOnMinimize?: true;
  /** 中身の左から最初のタブまで（px。いつもはタブの列の余白 8px。チャット欄は「表示」のボタンと「チャット」の札の後ろ） */
  firstTabX?: number;
}
/** 種類（route の /popout/<種類>）ごとの違い。種類の名前は画面の popoutKinds と同じ */
const POPOUT_KINDS: Readonly<Record<string, PopoutLook>> = {
  sidebar: { pane: { width: 300, height: 820, minWidth: 220 } },
  side: { pane: { width: 480, height: 820, minWidth: 320 }, webview: true, asksBeforeClose: true },
  chat: { asksBeforeClose: true, closeOnMinimize: true },
  chats: { firstTabX: 106 },
  browser: { webview: true },
};
const lookOf = (route: string): PopoutLook => POPOUT_KINDS[route.slice("/popout/".length).split("?")[0]] ?? {};
const paneBounds = new Map<string, Rectangle>();
/** 閉じ方を聞かずに閉じてよい別ウィンドウ（closeSelf で閉じるもの） */
const closingQuietly = new WeakSet<BrowserWindow>();

/** IPC の windows（画面から頼まれて開く）。appUrl は Kickoff の画面の URL（同じ画面を、route のハッシュで開く） */
export function popoutHandlers(appUrl: string): IpcHandlers["windows"] {
  return {
    openPopout: (_e, route, title, at) => openPopout(appUrl, route, title, at),
    focusMain: () => void showMainWindow(),
    captureRegion: (e, rect) => captureThumbnail(e.sender, rect),
    closeSelf: (e) => {
      const win = BrowserWindow.fromWebContents(e.sender);
      if (!win || !isPopout(win)) return;
      closingQuietly.add(win);
      win.close();
    },
  };
}

/** 画面のウィンドウ（メインのウィンドウと開いている別ウィンドウ。AI の埋め込みブラウザの頼みを送る先。チャット欄・ブラウザのタブは別ウィンドウにもある） */
export function appWindows(): BrowserWindow[] {
  const main = mainWindow();
  return [...(main ? [main] : []), ...popouts.values()].filter((w) => !w.isDestroyed());
}

/** 画面のウィンドウすべて（preload のある窓だけ。開発者ツールの窓には送らない）に知らせる */
export function broadcast<G extends IpcGroup, M extends IpcMethodOf<G, "event">>(group: G, method: M, ...args: IpcArgs<IpcSpec<G, M>>) {
  for (const win of appWindows()) sendEvent(win.webContents, group, method, ...args);
}

/**
 * 別ウィンドウの中身の左上から見た、最初のタブの左上の位置（上の帯 .popout-bar の 36px ＋ タブの列の上の余白 6px。左はタブの列の余白 8px、
 * チャットはその後ろに「表示」のボタンと「チャット」の札がある）。開発版で測った値で、画面（styles の .popout-bar・.panel-tabs）を変えたら直す
 */
const firstTabInContent = (route: string) => ({ x: lookOf(route).firstTabX ?? 8, y: 42 });

/**
 * 離した所にウィンドウを置く位置（tab = 最初のタブの左上を置く画面の位置。新しいウィンドウのタブが、離したときのタブとぴったり重なるように。
 * titleBar = ウィンドウの枠の上の帯の高さ。その画面の作業領域の中に収める）
 */
function placeAtDrop(route: string, tab: { x: number; y: number }, width: number, height: number, titleBar: number): { x: number; y: number } {
  const first = firstTabInContent(route);
  const x = tab.x - first.x;
  const y = tab.y - first.y - titleBar;
  const area = screen.getDisplayNearestPoint({ x: Math.round(tab.x), y: Math.round(tab.y) }).workArea;
  return {
    x: Math.round(clampInto(x, area.x, area.x + area.width - width)),
    y: Math.round(clampInto(y, area.y, area.y + area.height - height)),
  };
}

/** min〜max に収める（入りきらなければ min） */
const clampInto = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

/** タブのドラッグのサムネイルの幅（px。Retina で 220pt に見せるため 2 倍） */
const THUMBNAIL_WIDTH = 440;

/** 画面のその範囲を撮って、サムネイルの幅に縮めた JPEG の data URL にする（撮れなければ null） */
async function captureThumbnail(wc: Electron.WebContents, rect: Rectangle): Promise<string | null> {
  const area = { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.max(1, Math.round(rect.width)), height: Math.max(1, Math.round(rect.height)) };
  const image = await wc.capturePage(area).catch(() => null);
  if (!image || image.isEmpty()) return null;
  const small = image.getSize().width > THUMBNAIL_WIDTH ? image.resize({ width: THUMBNAIL_WIDTH, quality: "good" }) : image;
  return `data:image/jpeg;base64,${small.toJPEG(80).toString("base64")}`;
}

/** 開いている別ウィンドウか（メインのウィンドウから closeSelf を呼ばれても閉じない） */
function isPopout(win: BrowserWindow): boolean {
  for (const w of popouts.values()) if (w === win) return true;
  return false;
}

function openPopout(appUrl: string, route: string, title: string, dropAt: { x: number; y: number } | null) {
  const existing = popouts.get(route);
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore();
    existing.show();
    existing.focus();
    return;
  }
  const look = lookOf(route);
  const pane = look.pane;
  const usual = pane
    ? (paneBounds.get(route) ?? { width: pane.width, height: pane.height })
    : lastBounds
      ? { x: lastBounds.x + 24, y: lastBounds.y + 24, width: lastBounds.width, height: lastBounds.height }
      : { width: 920, height: 820 };
  // タブをウィンドウの外へドラッグして離したときは、離した所にウィンドウの上の端が来るように置く（Chrome のタブと同じ。大きさはいつもの大きさ）
  // 枠の上の帯の高さは、作ってから中身の位置と比べて決める（作るときは帯の分をずらさずに置き、作ってから置き直す）
  const at = dropAt ? { ...usual, ...placeAtDrop(route, dropAt, usual.width, usual.height, 0) } : usual;
  const win = createAppWindow({ ...at, minWidth: pane?.minWidth ?? 420, minHeight: 320, title, webview: look.webview ?? false }, `別ウィンドウ（${title}）`);
  if (dropAt) {
    const titleBar = win.getContentBounds().y - win.getBounds().y;
    const placed = placeAtDrop(route, dropAt, usual.width, usual.height, titleBar);
    win.setPosition(placed.x, placed.y);
  }
  // ウィンドウの名前は開いたときのもの（画面の <title> で書き換えない）
  win.on("page-title-updated", (e) => e.preventDefault());
  const url = new URL(appUrl);
  url.hash = route;
  void win.loadURL(url.toString());
  const remember = () => {
    if (win.isDestroyed()) return;
    if (pane) paneBounds.set(route, win.getBounds());
    else lastBounds = win.getBounds();
  };
  win.on("moved", remember);
  win.on("resized", remember);
  win.on("close", remember);
  win.on("closed", () => {
    if (popouts.get(route) === win) popouts.delete(route);
    // メインのウィンドウに知らせる（サイドバー・チャット欄を移したままにしない。画面が知らせられずに閉じたときも）
    sendEvent(mainWindow()?.webContents, "windows", "onPopoutClosed", route);
  });
  if (look.closeOnMinimize) win.on("minimize", () => win.destroy());
  if (look.asksBeforeClose) {
    // ✕・⌘W は閉じるのを止めて画面に知らせ、子チャットは閉じ方（表示だけ消す / アーカイブ / 削除）を聞き、チャット欄は状態をメインのウィンドウに戻す。
    // 済んだら画面が closeSelf で閉じる。
    // 画面の beforeunload では止められない（利用者の操作がないページの beforeunload は Chromium が無視する）。
    // アプリの終了は app.exit で閉じる（close が来ない）ので、ここで止めても終われる
    win.on("close", (e) => {
      if (closingQuietly.has(win) || win.webContents.isLoading()) return;
      e.preventDefault();
      win.focus();
      sendEvent(win.webContents, "windows", "onCloseRequested");
    });
  }
  popouts.set(route, win);
}
