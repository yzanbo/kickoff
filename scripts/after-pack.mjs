// electron-builder の afterPack（electron-builder.yml）: 組み立てたアプリの fuses を入れてから、自分で署名する（scripts/signing.mjs）。
// electron-builder は afterPack のあとに fuses を入れるので、先に同じ設定で入れておく（あとの書き込みは同じ中身になり、署名は崩れない）。
// zip・blockmap・latest-mac.yml は、この後で electron-builder が署名済みのアプリから作る
import path from "node:path";
import { signApp, signModeOf, verifySignature } from "./signing.mjs";
import { vaultOf } from "./vault.mjs";

const entitlements = path.join(import.meta.dirname, "..", "build", "entitlements.mac.plist");

export default async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;
  const { packager } = context;
  const appPath = path.join(context.appOutDir, `${packager.appInfo.productFilename}.app`);
  if (packager.config.electronFuses) {
    await packager.addElectronFuses(context, await packager.generateFuseConfig(packager.config.electronFuses));
  }
  if (signModeOf(process.env.KICKOFF_SIGN) === "release") {
    // 金庫は呼ぶ側（install-app・publish）が開けておく。ここでは開けない
    const vault = vaultOf();
    signApp(appPath, { identity: vault.identity, keychain: vault.keychain, entitlements });
    verifySignature(appPath, vault.identity);
    console.log(`金庫の印鑑（${vault.identity}）で署名しました`);
  } else {
    signApp(appPath, { identity: "-", entitlements });
    verifySignature(appPath, null);
    console.log("仮の署名（印鑑なし）で署名しました");
  }
}
