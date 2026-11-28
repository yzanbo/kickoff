// 更新のメインの部品（src/app/desktop/index.ts が土台へ渡す）: IPC の updates・メニューの「アップデートを確認…」・「Kickoff について」の窓・
// 版が変わったときの画面の HTTP キャッシュの片付け。新しい版を確かめるのは、印鑑で署名した製品版（配った版・手元ビルド）だけ
import { app, autoUpdater as nativeUpdater, BrowserWindow, session } from "electron";
import electronUpdater from "electron-updater";
import { systemClock } from "@/foundation/core/clock";
import type { CoreProcess } from "@/foundation/desktop/app/coreProcess";
import { startupLog } from "@/foundation/desktop/app/startupLog";
import { mainWindow, showMainWindow } from "@/foundation/desktop/app/window";
import { sendEvent } from "@/foundation/desktop/ipc/register";
import { defineDesktopPart } from "@/foundation/desktop/parts";
import type { UpdatesSnapshot } from "@shared/updates/types";
import { buildInfo, setAboutPanel } from "./buildInfo";
import { clearCacheIfBuildChanged } from "./cacheReset";
import { updatesArgs } from "./ipcArgs";
import { createUpdateController, type UpdateController } from "./updater";

const info = buildInfo();
/** 印鑑で署名した製品版か（開発版・印鑑なしの版は、印鑑が違って更新を入れられないので確かめない） */
const supported = process.platform === "darwin" && app.isPackaged && (info.kind === "release" || info.kind === "local");

let controller: UpdateController | null = null;

const snapshot = (): UpdatesSnapshot => ({ build: info, supported, state: controller?.state() ?? { kind: "idle" } });

const publish = () => {
  const value = snapshot();
  for (const win of BrowserWindow.getAllWindows()) sendEvent(win.webContents, "updates", "onState", value);
};

/** electron-updater を用意して、様子の移り変わりの殻に渡す */
function createController(core: CoreProcess): UpdateController {
  const { autoUpdater } = electronUpdater;
  // 見つけてもすぐには取りに行かない（飛ばした版を取りに行かないため）。終了のときに黙って入れない（入れるのは［更新して開き直す］だけ）。
  // channel は代入しない（代入すると allowDowngrade が true になる。版の一覧は electron-builder.yml の detectUpdateChannel: false で latest-mac.yml の 1 つ）
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.logger = { info: () => {}, warn: (m: unknown) => startupLog(`更新: ${String(m)}`), error: (m: unknown) => startupLog(`更新: ${String(m)}`), debug: () => {} };
  return createUpdateController({
    port: autoUpdater,
    clock: systemClock,
    prefs: () => core.call("updates.settings"),
    running: () => core.lastAwake?.running ?? 0,
    onRunning: (fn) => core.on("awake", (needs) => fn(needs.running)),
    publish,
    log: startupLog,
  });
}

/** メニューの「アップデートを確認…」: メインのウィンドウに設定の「Kickoff について」を開かせ、確かめる */
function checkFromMenu() {
  showMainWindow();
  sendEvent(mainWindow()?.webContents, "updates", "onOpenRequested");
  void controller?.check(true);
}

export const updatesDesktop = defineDesktopPart({
  name: "updates",
  ipc: {
    updates: {
      snapshot: async () => snapshot(),
      check: async () => controller?.check(true),
      install: async () => controller?.requestInstall(),
      cancelInstall: async () => controller?.cancelInstall(),
      skip: async () => controller?.skip(),
    },
  },
  argSchemas: updatesArgs,
  appMenu: [{ label: "アップデートを確認…", click: checkFromMenu }],
  connectCore(core) {
    setAboutPanel(info);
    if (!supported) return;
    controller = createController(core);
    // 入れて開き直すとき、窓を閉じるのを止める部品（別ウィンドウの閉じ方を聞くなど）があると開き直せないので、窓を聞かずに閉じる
    nativeUpdater.on("before-quit-for-update", () => {
      for (const win of BrowserWindow.getAllWindows()) win.destroy();
    });
  },
  beforeLoad: () => (app.isPackaged ? clearCacheIfBuildChanged({ userData: app.getPath("userData"), info, clearCache: () => session.defaultSession.clearCache(), log: startupLog }) : Promise.resolve()),
  ready() {
    controller?.start();
  },
});
