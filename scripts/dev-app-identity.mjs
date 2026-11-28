// 開発中に起動する Electron.app（node_modules の中）の名前とアイコンを「Kickoff Dev」に、アプリ ID を開発版のものにする（Dock・メニューバー・⌘Tab に「Electron」と出ないように。
// インストールした Kickoff と同時に動かすので、名前と DEV の帯のアイコンで見分ける。名前は src/foundation/core/system/appEnv.ts の development と同じ）。
// npm install で Electron.app が置き直されることがあるので、postinstall から呼ぶ。ビルドしたアプリは electron-builder.yml と build/icon.icns で決まる
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, utimesSync } from "node:fs";
import path from "node:path";
import { bundleIdOf, cdhashOf, DEVELOPMENT_BUNDLE_ID, resetPrivacyPermissions } from "./mac-privacy.mjs";

const root = path.join(import.meta.dirname, "..");
const bundle = path.join(root, "node_modules", "electron", "dist", "Electron.app");
const name = "Kickoff Dev";
const icon = path.join(root, "build", "icon-dev.icns");

if (process.platform !== "darwin" || !existsSync(bundle)) process.exit(0);

// 同じ中身を同じ手順で署名すると同じハッシュになるので、Electron.app が置き直されていなければ許可はそのまま効く
const previousHash = cdhashOf(bundle);
// ID を替えた版へ上げたとき、前の ID の許可の記録も片付ける（Electron の既定の ID は、ほかの Electron 製アプリと共通なので消さない）
const previousId = bundleIdOf(bundle);
const plist = path.join(bundle, "Contents", "Info.plist");
for (const key of ["CFBundleName", "CFBundleDisplayName"]) {
  execFileSync("plutil", ["-replace", key, "-string", name, plist]);
}
// Electron の既定の ID（com.github.Electron）はほかの Electron 製アプリと共通なので、許可が混ざらないよう替える。
// 中の Helper は外のアプリの ID を使うので、替えるのは外の Info.plist だけでよい
execFileSync("plutil", ["-replace", "CFBundleIdentifier", "-string", DEVELOPMENT_BUNDLE_ID, plist]);
if (existsSync(icon)) copyFileSync(icon, path.join(bundle, "Contents", "Resources", "electron.icns"));
// Info.plist を書き換えると署名が合わなくなるので、手元用の署名（ad-hoc）をし直す
execFileSync("codesign", ["--force", "--deep", "--sign", "-", bundle], { stdio: "ignore" });
// Finder・Dock がアイコンを読み直すよう、更新日時を変える
const now = new Date();
utimesSync(bundle, now, now);
console.log(`開発用の Electron.app を「${name}」の名前とアイコンにしました`);
// 中身が変わったら、アクセシビリティ・画面収録の許可を消して聞き直してもらう
const staleIds = previousId && previousId !== "com.github.Electron" ? [previousId, DEVELOPMENT_BUNDLE_ID] : [DEVELOPMENT_BUNDLE_ID];
if (cdhashOf(bundle) !== previousHash && resetPrivacyPermissions(staleIds).length > 0) {
  console.log("開発版のアクセシビリティ・画面収録の許可を消しました（次に使うときに macOS が聞き直します）");
}
