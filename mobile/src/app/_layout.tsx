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

/**
 * つないだ本体それぞれに、この端末のプッシュの宛先を知らせる（本体は見ていない端末にだけ送る）。つながるたびに知らせ直す
 * （オフラインで知らせられなかった・宛先が変わった・本体の側で外れた（アプリを入れ直した）ときも、次につながったら戻る）
 */
function PushRegistrar() {
  const { hosts, session } = useHosts();
  useEffect(() => {
    if (hosts.length === 0) return;
    let token: Promise<string | null> | null = null;
    // 取れたら覚える（取れなかった = オフラインなどは覚えず、次につながったときに取り直す）
    const tokenOnce = () =>
      (token ??= expoPushToken().then((r) => {
        if (!r.token) token = null;
        return r.token;
      }));
    const offs: (() => void)[] = [];
    for (const h of hosts) {
      const s = session(h.host_id);
      if (!s) continue;
      const register = () =>
        void tokenOnce().then(async (t) => {
          if (t) await s.client.setPush({ kind: "expo", token: t }).catch(() => {});
        });
      if (s.state.kind === "open") register();
      offs.push(s.onOpen(register));
    }
    return () => offs.forEach((off) => off());
  }, [hosts, session]);
  return null;
}

/** 通知を押したら、その本体のそのチャットを開く（閉じていたアプリを通知から開いたときも。外した本体の通知なら本体の一覧へ） */
function NoticeOpener() {
  const router = useRouter();
  const { hosts, loaded } = useHosts();
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    const notice = noticeOf(response);
    const id = response?.notification.request.identifier ?? null;
    if (!notice || !id || !loaded || handled.current === id) return;
    handled.current = id;
    router.push(hosts.some((h) => h.host_id === notice.host_id) ? routeOfNotice(notice) : "/");
    Notifications.clearLastNotificationResponse();
  }, [response, router, hosts, loaded]);
  return null;
}
