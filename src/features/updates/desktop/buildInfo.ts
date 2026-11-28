// この版の情報（ビルドのときに electron.vite.config.ts が __KICKOFF_BUILD__ を埋め込む。scripts/build-stamp.mjs）
import { app } from "electron";
import { buildDetail } from "@shared/updates/buildLabel";
import type { BuildInfo, BuildStamp } from "@shared/updates/types";

declare const __KICKOFF_BUILD__: BuildStamp | undefined;

/** 埋め込みのない実行（テスト・tsx で動かしたとき）は開発版として扱う */
const stamp: BuildStamp = typeof __KICKOFF_BUILD__ === "undefined" ? { buildNumber: null, commit: null, kind: "dev" } : __KICKOFF_BUILD__;

/** この版の情報（開発中の Electron は package.json の版、作った製品版は Info.plist の版） */
export const buildInfo = (): BuildInfo => ({ ...stamp, version: app.getVersion() });

/** メニューの「Kickoff について」の窓に、版と一緒にビルド番号・短い SHA・作り方を出す */
export function setAboutPanel(info: BuildInfo) {
  app.setAboutPanelOptions({ applicationName: app.getName(), applicationVersion: info.version, version: buildDetail(info) ?? "" });
}
