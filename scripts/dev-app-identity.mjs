// 開発中に起動する Electron.app（node_modules の中）の名前とアイコンを「Kickoff Dev」にする（Dock・メニューバー・⌘Tab に「Electron」と出ないように。
// インストールした Kickoff と同時に動かすので、名前と DEV の帯のアイコンで見分ける。名前は src/core/system/appEnv.ts の development と同じ）。
// npm install のたびに Electron.app が置き直されるので、postinstall から呼ぶ。ビルドしたアプリは electron-builder.yml と build/icon.icns で決まる
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, utimesSync } from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const bundle = path.join(root, "node_modules", "electron", "dist", "Electron.app");
const name = "Kickoff Dev";
const icon = path.join(root, "build", "icon-dev.icns");

if (process.platform !== "darwin" || !existsSync(bundle)) process.exit(0);

const plist = path.join(bundle, "Contents", "Info.plist");
for (const key of ["CFBundleName", "CFBundleDisplayName"]) {
  execFileSync("plutil", ["-replace", key, "-string", name, plist]);
}
if (existsSync(icon)) copyFileSync(icon, path.join(bundle, "Contents", "Resources", "electron.icns"));
// Info.plist を書き換えると署名が合わなくなるので、手元用の署名（ad-hoc）をし直す
execFileSync("codesign", ["--force", "--deep", "--sign", "-", bundle], { stdio: "ignore" });
// Finder・Dock がアイコンを読み直すよう、更新日時を変える
const now = new Date();
utimesSync(bundle, now, now);
console.log(`開発用の Electron.app を「${name}」の名前とアイコンにしました`);
