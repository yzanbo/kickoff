// 仮の署名（ad-hoc）のアプリは、macOS のプライバシーの許可（アクセシビリティ・画面収録）が中身のハッシュ（cdhash）に結びつく。
// 作り直してハッシュが変わると、システム設定ではオンのまま効かなくなり、記録が残っているので macOS も聞き直さない。
// そこでハッシュが変わったときだけ古い記録を消し、次に使ったときに聞き直してもらう（install-app.mjs と dev-app-identity.mjs が使う）
import { execFileSync, spawnSync } from "node:child_process";

/** 製品版のアプリ ID（electron-builder.yml の appId と同じ） */
export const PRODUCTION_BUNDLE_ID = "app.kickoff.desktop";
/** 開発版のアプリ ID（製品版と許可を混ぜないよう分ける） */
export const DEVELOPMENT_BUNDLE_ID = `${PRODUCTION_BUNDLE_ID}.dev`;

/** 消す許可。マイクなどの、記録が合わないと聞き直してくれるものは入れない */
const SERVICES = ["Accessibility", "ScreenCapture"];

/** codesign -dvvv の出力から cdhash を取り出す。署名がないときは null */
export function parseCdhash(output) {
  return /^CDHash=([0-9a-f]+)$/m.exec(output)?.[1] ?? null;
}

/** アプリの cdhash。署名がない・読めないときは null（codesign -d は成功しても詳細を標準エラーに書く） */
export function cdhashOf(appPath) {
  return parseCdhash(spawnSync("codesign", ["-dvvv", appPath], { encoding: "utf8" }).stderr ?? "");
}

/** アプリの ID（Info.plist の CFBundleIdentifier）。読めないときは null */
export function bundleIdOf(appPath) {
  try {
    return execFileSync("plutil", ["-extract", "CFBundleIdentifier", "raw", `${appPath}/Contents/Info.plist`], { encoding: "utf8" }).trim() || null;
  } catch {
    return null;
  }
}

/**
 * その ID のアクセシビリティ・画面収録の許可を消す。消した ID を返す。
 * 一度も起動していない ID は macOS が知らず tccutil が断るが、そのときは消す記録もないので黙って飛ばす
 */
export function resetPrivacyPermissions(bundleIds) {
  return [...new Set(bundleIds)].filter((id) =>
    // 片方が断られても、もう片方は消す（some で途中で止めない）
    SERVICES.map((service) => spawnSync("tccutil", ["reset", service, id], { stdio: "ignore" }).status === 0).includes(true),
  );
}
