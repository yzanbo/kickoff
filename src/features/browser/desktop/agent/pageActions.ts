// 埋め込みブラウザのページへの操作（WebContents を受ける。待つ・動かす・撮る・キーを押す）
import { nativeImage, webContents, type WebContents } from "electron";
import type { BrowserHandOffCapture } from "@shared/foundation/ipc";
import { sleep, withTimeout } from "@shared/foundation/time";
import { isOurWebview } from "@/features/browser/desktop/browser";
import { flattenOnWhite } from "@/features/browser/desktop/flatten";
import { browserKeyCode } from "@/features/browser/desktop/keys";
import { webviewProblemsOf } from "@/features/browser/desktop/webviewConsole";
import { VIEWPORT_SCRIPT } from "@/features/browser/desktop/pageScripts";
import { infoOf, type Entry } from "./tabRegistry";

/** 読み込み終えるのを待つ長さ */
export const LOAD_TIMEOUT_MS = 20_000;
/** JavaScript の実行を待つ長さ */
const EVAL_TIMEOUT_MS = 15_000;
/** 撮る画像の幅の上限（px） */
const SHOT_MAX_WIDTH = 1280;
/** 結果の文の上限 */
const RESULT_MAX = 20_000;

/** ページを動かす（失敗はページの JavaScript のエラーの文にする） */
export async function run<T>(wc: WebContents, script: string): Promise<T> {
  return (await withTimeout(wc.executeJavaScript(script, true), EVAL_TIMEOUT_MS, "ページが応答しません（JavaScript の実行が 15 秒で終わりませんでした）")) as T;
}

/** 読み込みが終わるのを待つ（始まりそうなら少し待ってから。長くかかれば、読み込み中のまま返す） */
export async function settle(wc: WebContents, startGraceMs = 300) {
  await sleep(startGraceMs);
  if (wc.isDestroyed() || !wc.isLoading()) return;
  await Promise.race([new Promise<void>((resolve) => wc.once("did-stop-loading", () => resolve())), sleep(LOAD_TIMEOUT_MS)]);
}

/** 表に出したタブが、開いた欄の大きさで並び終えるのを待つ（大きさが 2 回続けて同じになるまで。閉じた欄の見えない並びから変わるため） */
export async function settledLayout(wc: WebContents) {
  let last = "";
  for (let i = 0; i < 20; i++) {
    const size = await run<string>(wc, "`${innerWidth}x${innerHeight}`").catch(() => "");
    if (size !== "" && size !== "0x0" && size === last) return;
    last = size;
    await sleep(50);
  }
}

/** 見えない形でも並べられるのを待つ（表に出ていないタブは、印を受けた画面が並べ直すまで大きさが 0） */
export async function laidOut(wc: WebContents): Promise<boolean> {
  for (let i = 0; i < 15; i++) {
    if (((await run<number>(wc, VIEWPORT_SCRIPT).catch(() => 0)) ?? 0) > 0) return true;
    await sleep(100);
  }
  return false;
}

/** 見えている範囲を撮る（幅は SHOT_MAX_WIDTH まで・白の上に置いた JPEG の base64。AI の browser_screenshot とタブの「AI に渡す」で同じもの） */
export async function shoot(wc: WebContents): Promise<{ data: string; width: number; height: number }> {
  if (!(await laidOut(wc))) throw new Error("このタブはいま画面に並んでいないため撮れません（チャット欄・パネルを開くと撮れます）");
  let image = await wc.capturePage();
  if (image.isEmpty()) throw new Error("画面を撮れませんでした（タブが画面に並んでいない可能性があります）");
  if (image.getSize().width > SHOT_MAX_WIDTH) image = image.resize({ width: SHOT_MAX_WIDTH, quality: "good" });
  // 背景を決めていないページは透明に撮れるので、利用者に見えているとおり白の上に置く（JPEG では黒くなる）
  const size = image.getSize();
  image = nativeImage.createFromBitmap(Buffer.from(flattenOnWhite(image.toBitmap())), size);
  return { data: image.toJPEG(80).toString("base64"), ...size };
}

/**
 * タブの「AI に渡す」: 見えている範囲の画面と、覚えているコンソールのエラー・警告を取る（画面が撮れなくてもコンソールは返す）。
 * 頼んだ画面の中の webview だけを受ける（ほかのウィンドウ・ページのものは断る）
 */
export async function handOffCapture(e: { sender: WebContents }, webContentsId: number): Promise<BrowserHandOffCapture> {
  const wc = webContents.fromId(webContentsId);
  if (!isOurWebview(e.sender, wc) || wc.isDestroyed()) throw new Error("このタブのページが見つかりません");
  const console = webviewProblemsOf(wc.id);
  try {
    return { screen: await shoot(wc), screenError: null, console };
  } catch (e) {
    return { screen: null, screenError: e instanceof Error ? e.message : String(e), console };
  }
}

/** 長い結果の文を切り詰める */
export const truncate = (s: string) => (s.length > RESULT_MAX ? `${s.slice(0, RESULT_MAX)}\n…（以下 ${s.length - RESULT_MAX} 文字を省略）` : s);

/** 押した・打ったあとの様子（ページが移ったら、その先） */
export async function after(entry: Entry, done: string) {
  await settle(entry.wc);
  const { url, title } = infoOf(entry);
  return `${done}。いまのページ: ${title || "(題なし)"} — ${url}`;
}

/** キーを押す（押す・文字・離す） */
export function sendKey(wc: WebContents, key: string) {
  const keyCode = browserKeyCode(key);
  wc.sendInputEvent({ type: "keyDown", keyCode });
  if (key.length === 1 || keyCode === "Enter") wc.sendInputEvent({ type: "char", keyCode: keyCode === "Enter" ? "\r" : key });
  wc.sendInputEvent({ type: "keyUp", keyCode });
}
