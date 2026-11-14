// プッシュ通知（Expo Push）。アプリを裏に回すと SSE は切れるので、チャットの終わり・確認待ちはプッシュで知る。
// 本体は、この端末のプッシュ用 ID 宛てに Expo を呼ぶだけ（秘密の鍵を持たない）。通知の中身は短い文と、本体の ID・開くもの
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import type { NoticeTargetData } from "../lib/notice";

/** 本体（core/notifications/expoPush.ts の EXPO_CHANNEL_ID）と同じチャンネル。先に作らないと Android 13 以降は許可を聞けず、通知も出ない */
export const CHANNEL_ID = "chats";

// アプリを開いている間に届いた通知も出す（見ているチャットの知らせは、本体が送ってこない）
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

/**
 * この端末のプッシュ用 ID（Expo のトークン）。許可がない・実機でない・Expo のプロジェクトがない・オフラインなら null（理由は reason に）
 */
export async function expoPushToken(): Promise<{ token: string | null; reason: string | null }> {
  if (!Device.isDevice) return { token: null, reason: "エミュレーターではプッシュを受け取れません" };
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, { name: "チャット", importance: Notifications.AndroidImportance.HIGH });
  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) return { token: null, reason: "通知が許可されていません（Android の設定で許可できます）" };
  const projectId = (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return { token: null, reason: "このアプリは Expo のプロジェクトなしで作られたので、プッシュを受け取れません" };
  try {
    return { token: (await Notifications.getExpoPushTokenAsync({ projectId })).data, reason: null };
  } catch (e) {
    return { token: null, reason: `プッシュの準備ができません（${e instanceof Error ? e.message : String(e)}）` };
  }
}

/** 通知の data から開くものを読む（本体の通知でなければ null） */
export function noticeOf(response: Notifications.NotificationResponse | null | undefined): NoticeTargetData | null {
  const data = response?.notification.request.content.data as Partial<NoticeTargetData> | undefined;
  if (!data || typeof data.host_id !== "string" || !data.target) return null;
  return { host_id: data.host_id, target: data.target };
}
