// Dock のアイコンの差し替え（Mac）。画面が状態の数を描き込んだ PNG を受けて当て、null・画面が消えたら元のアイコンに戻す
import path from "node:path";
import { app, nativeImage, type WebContents } from "electron";

/** 下地の大きさ（px）。Dock のいちばん大きい表示（拡大 128pt の Retina）の 2 倍あれば足りる */
const BASE_SIZE = 512;

let base: Promise<string | null> | null = null;

/**
 * 元のアイコンの PNG の data URL（取れなければ null。1 回だけ取って覚える）。
 * nativeImage は .icns を読めないので、.app を Quick Look の縮小画像で読む（Dock と同じ角丸・光沢の形で返る）
 */
export function dockIconBase(): Promise<string | null> {
  if (!app.dock) return Promise.resolve(null);
  // 実行ファイルは <名前>.app/Contents/MacOS/<名前>（製品版も開発版の Electron.app も同じ）
  const bundle = path.resolve(app.getPath("exe"), "..", "..", "..");
  base ??= nativeImage
    .createThumbnailFromPath(bundle, { width: BASE_SIZE, height: BASE_SIZE })
    .then((image) => (image.isEmpty() ? null : image.toDataURL()))
    .catch(() => null);
  return base;
}

/** いま差し替えている画面（その画面が消えた・読み込み直したら戻す） */
let owner: WebContents | null = null;
const watched = new WeakSet<WebContents>();

function restore() {
  owner = null;
  // 型の宣言に null はないが、null で元の（.app の）アイコンに戻る（Electron の DockSetIcon）
  app.dock?.setIcon(null as unknown as string);
}

/** 差し替えた画面を見張る。画面が描き直さないまま消えると、古い数が Dock に残るため */
function watch(sender: WebContents) {
  owner = sender;
  if (watched.has(sender)) return;
  watched.add(sender);
  const gone = () => {
    if (owner === sender) restore();
  };
  sender.on("destroyed", gone);
  sender.on("render-process-gone", gone);
  sender.on("did-start-navigation", (details) => {
    if (details.isMainFrame && !details.isSameDocument) gone();
  });
}

/** Dock のアイコンを当てる（null・空の画像なら元に戻す） */
export function setDockIcon(sender: WebContents, dataUrl: string | null): void {
  if (!app.dock) return;
  const image = dataUrl ? nativeImage.createFromDataURL(dataUrl) : null;
  if (!image || image.isEmpty()) return restore();
  watch(sender);
  app.dock.setIcon(image);
}
