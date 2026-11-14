// アプリの枠: つないだ本体の一覧（HostsProvider）・プッシュの宛先の登録・通知を押したときの行き先・縦 1 列の画面の重なり（Stack）
import { useEffect, useRef } from "react";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import { routeOfNotice } from "../lib/notice";
import { HostsProvider, useHosts } from "../state/hosts";
import { expoPushToken, noticeOf } from "../state/push";
import { colors } from "../ui/theme";

export default function RootLayout() {
  return (
    <HostsProvider>
      <StatusBar style="light" />
      <PushRegistrar />
      <NoticeOpener />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.elev },
          headerTintColor: colors.text,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ title: "Kickoff" }} />
        <Stack.Screen name="pair" options={{ title: "本体をつなぐ" }} />
      </Stack>
    </HostsProvider>
  );
}

/** つないだ本体それぞれに、この端末のプッシュの宛先を知らせる（本体が見ていない端末にだけ送る。登録し直しても同じ宛先なら変わらない） */
function PushRegistrar() {
  const { hosts, session } = useHosts();
  useEffect(() => {
    if (hosts.length === 0) return;
    let alive = true;
    void expoPushToken().then(({ token }) => {
      if (!alive || !token) return;
      for (const h of hosts) void session(h.host_id)?.client.setPush({ kind: "expo", token }).catch(() => {});
    });
    return () => {
      alive = false;
    };
  }, [hosts, session]);
  return null;
}

/** 通知を押したら、その本体のそのチャットを開く（閉じていたアプリを通知から開いたときも） */
function NoticeOpener() {
  const router = useRouter();
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    const notice = noticeOf(response);
    const id = response?.notification.request.identifier ?? null;
    if (!notice || !id || handled.current === id) return;
    handled.current = id;
    router.push(routeOfNotice(notice));
    Notifications.clearLastNotificationResponse();
  }, [response, router]);
  return null;
}
