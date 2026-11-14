// 本体のチャット一覧（プロジェクトごと。回答待ち → 作業中 → 未読 → 最後に動いた順）。押すとチャットへ。新しいチャット・ターミナル
import { useMemo } from "react";
import { Pressable, SectionList, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { AGENT_STATE_LABELS, type AgentState } from "@shared/types";
import { chatSections } from "../../lib/hostState";
import { useHosts } from "../../state/hosts";
import { useHostState } from "../../state/useHostState";
import { ConnectionBanner } from "../../ui/ConnectionBanner";
import { colors, ui } from "../../ui/theme";

const STATE_COLORS: Record<AgentState, string> = { needs_input: colors.warn, failed: colors.ng, running: colors.running, unread: colors.ok, read: colors.border };

export default function ChatListScreen() {
  const { host } = useLocalSearchParams<{ host: string }>();
  const router = useRouter();
  const { hosts } = useHosts();
  const record = hosts.find((h) => h.host_id === host);
  const { connection, state, access, error } = useHostState(host);
  const sections = useMemo(() => chatSections(state).map((s) => ({ ...s, data: s.rows })), [state]);
  const base = `/${encodeURIComponent(host)}`;
  return (
    <View style={ui.screen}>
      <Stack.Screen options={{ title: record?.name ?? "本体" }} />
      <ConnectionBanner state={connection} />
      {error && <Text style={[ui.error, { padding: 12 }]}>{error}</Text>}
      <SectionList
        sections={sections}
        keyExtractor={(row) => String(row.chat.id)}
        contentContainerStyle={{ paddingBottom: 24 }}
        renderSectionHeader={({ section }) => (
          <View style={[ui.row, { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 6, backgroundColor: colors.bg }]}>
            <Text style={[ui.muted, { flex: 1, fontWeight: "600" }]}>{section.project.name}</Text>
            {access === "full" && (
              <Pressable onPress={() => router.push(`${base}/new?project=${section.project.id}`)} hitSlop={10}>
                <Text style={{ color: colors.accent }}>＋ 新しいチャット</Text>
              </Pressable>
            )}
            <Pressable onPress={() => router.push(`${base}/terminals?project=${section.project.id}`)} hitSlop={10}>
              <Text style={{ color: colors.accent, marginLeft: 12 }}>ターミナル</Text>
            </Pressable>
          </View>
        )}
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`${base}/chat/${item.chat.id}`)} style={({ pressed }) => [{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.border }, pressed && { backgroundColor: colors.hover }]}>
            <View style={ui.row}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: STATE_COLORS[item.state] }} />
              <Text style={[ui.text, { flex: 1 }]} numberOfLines={1}>
                {item.chat.title}
              </Text>
              {item.state !== "read" && <Text style={[ui.muted, { color: STATE_COLORS[item.state] }]}>{AGENT_STATE_LABELS[item.state]}</Text>}
            </View>
          </Pressable>
        )}
        ListEmptyComponent={connection.kind === "open" ? <Text style={[ui.muted, { padding: 16 }]}>プロジェクトがありません</Text> : undefined}
      />
    </View>
  );
}
