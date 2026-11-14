// アプリの設定。パッケージ名（app.ade.kickoff）と Expo のプロジェクトは、あとで変えると別のアプリ扱い・プッシュの宛先が使えなくなるので固定する
// （2026-11-14 に利用者と決めた）。Expo のプロジェクトの ID（EXPO_PROJECT_ID）と Firebase の google-services.json は、配る人が自分のものを用意する
// （リポジトリには入れない。mobile/README.md）
import fs from "node:fs";
import type { ExpoConfig } from "expo/config";

const projectId = process.env.EXPO_PROJECT_ID;
const googleServices = "./google-services.json";

const config: ExpoConfig = {
  name: "Kickoff",
  slug: "kickoff",
  version: "0.1.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  scheme: "kickoff",
  userInterfaceStyle: "automatic",
  android: {
    package: "app.ade.kickoff",
    adaptiveIcon: {
      backgroundColor: "#1B1F20",
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    // FCM（Expo Push が Android に届ける道）。配る人が Firebase で作ったものを mobile/ に置く
    ...(fs.existsSync(googleServices) ? { googleServicesFile: googleServices } : {}),
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    ["expo-camera", { cameraPermission: "Mac の Kickoff の画面に出した QR を読むために、カメラを使います", recordAudioAndroid: false, barcodeScannerEnabled: true }],
    ["expo-notifications", { defaultChannel: "chats" }],
  ],
  extra: { eas: projectId ? { projectId } : {} },
  ...(projectId ? { owner: process.env.EXPO_OWNER } : {}),
};

export default config;
