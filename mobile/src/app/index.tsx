// 本体の一覧（Mac・Windows の Kickoff）。押すとその本体のチャット一覧へ。本体をつなぐ（QR を読む）・外す
import { useEffect, useState } from "react";
import { Alert, FlatList, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { DEVICE_ACCESS_LABELS } from "@shared/types";
import type { HostRecord } from "../lib/hosts";
import { useHosts, useHostSession } from "../state/hosts";
import { Button } from "../ui/Button";
import { colors, sessionStateText, ui } from "../ui/theme";

export default function HostsScreen() {
  const router = useRouter();
  const { hosts, loaded, registry, reload } = useHosts();
  const remove = (h: HostRecord) =>
    Alert.alert(`「${h.name}」を外しますか？`, "この端末から、この本体の登録とトークンを消します。本体の側の登録は、Mac の設定の「スマホ連携」で取り消してください。", [
      { text: "やめる", style: "cancel" },
      { text: "外す", style: "destructive", onPress: () => void registry.remove(h.host_id).then(reload) },
    ]);
  return (
    <View style={ui.screen}>
      <FlatList
        data={hosts}
        keyExtractor={(h) => h.host_id}
        contentContainerStyle={ui.pad}
        ListEmptyComponent={
          loaded ? (
            <View style={ui.card}>
              <Text style={ui.title}>まだ本体をつないでいません</Text>
              <Text style={ui.muted}>Mac の Kickoff の設定の「スマホ連携」で「端末をつなぐ」を押し、出た QR を読みます。Mac とこのスマホに Tailscale を入れ、同じアカウントでログインしておいてください。</Text>
            </View>
          ) : undefined
        }
        renderItem={({ item }) => <HostRow host={item} onOpen={() => router.push(`/${encodeURIComponent(item.host_id)}`)} onRemove={() => remove(item)} />}
        ListFooterComponent={<Button primary label="本体をつなぐ（QR を読む）" onPress={() => router.push("/pair")} style={{ marginTop: 8 }} />}
      />
    </View>
  );
}

function HostRow({ host, onOpen, onRemove }: { host: HostRecord; onOpen: () => void; onRemove: () => void }) {
  const { state, session } = useHostSession(host.host_id);
  const [name, setName] = useState(host.name);
  useEffect(() => setName(host.name), [host.name]);
  const status = sessionStateText(state);
  return (
    <Pressable onPress={onOpen} onLongPress={onRemove} style={({ pressed }) => [ui.card, pressed && { backgroundColor: colors.hover }]}>
      <View style={ui.row}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: state.kind === "open" ? colors.ok : state.kind === "connecting" ? colors.warn : colors.ng }} />
        <Text style={ui.title}>{name}</Text>
        {host.access === "read" && <Text style={ui.muted}>{DEVICE_ACCESS_LABELS.read}</Text>}
      </View>
      <Text style={ui.muted}>{host.url}</Text>
      {status && <Text style={ui.muted}>{status}</Text>}
      {!session && <Text style={ui.error}>トークンが見つかりません。外してつなぎ直してください</Text>}
      <Text style={[ui.muted, { fontSize: 11 }]}>長押しで外す</Text>
    </Pressable>
  );
}
