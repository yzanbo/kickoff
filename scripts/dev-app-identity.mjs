// 開発中に起動する Electron.app（node_modules の中）の名前とアイコンを Kickoff にする（Dock・メニューバー・⌘Tab に「Electron」と出ないように）。
// npm install のたびに Electron.app が置き直されるので、postinstall から呼ぶ。ビルドしたアプリは electron-builder.yml と build/icon.icns で決まる
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, utimesSync } from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const bundle = path.join(root, "node_modules", "electron", "dist", "Electron.app");
const icon = path.join(root, "build", "icon.icns");

if (process.platform !== "darwin" || !existsSync(bundle)) process.exit(0);

const plist = path.join(bundle, "Contents", "Info.plist");
for (const key of ["CFBundleName", "CFBundleDisplayName"]) {
  execFileSync("plutil", ["-replace", key, "-string", "Kickoff", plist]);
}
if (existsSync(icon)) copyFileSync(icon, path.join(bundle, "Contents", "Resources", "electron.icns"));
// Info.plist を書き換えると署名が合わなくなるので、手元用の署名（ad-hoc）をし直す
execFileSync("codesign", ["--force", "--deep", "--sign", "-", bundle], { stdio: "ignore" });
// Finder・Dock がアイコンを読み直すよう、更新日時を変える
const now = new Date();
utimesSync(bundle, now, now);
console.log("開発用の Electron.app を Kickoff の名前とアイコンにしました");
