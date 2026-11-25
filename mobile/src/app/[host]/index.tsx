// 本体のチャット一覧（共通を先頭にプロジェクトごと。回答待ち → 作業中 → 未読 → 最後に動いた順）。押すとチャットへ。
// いちばん上の「新しいチャット」は共通に作る（送る前に作成先を変えられる）。節ごとに新しいチャット・ターミナル
import { useMemo } from "react";
import { STATE_LOOKS } from "@shared/chat/stateLooks";
import { isActiveUserProject, isCommonProject } from "@shared/projects/kinds";
import { Pressable, SectionList, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { chatSections, newChatTarget } from "../../lib/hostState";
import { useHosts } from "../../state/hosts";
import { useHostState } from "../../state/useHostState";
import { ConnectionBanner } from "../../ui/ConnectionBanner";
import { Button } from "../../ui/Button";
import { TONE_COLORS } from "../../ui/colors";
import { colors, ui } from "../../ui/theme";


export default function ChatListScreen() {
  const { host } = useLocalSearchParams<{ host: string }>();
  const router = useRouter();
  const { hosts } = useHosts();
  const record = hosts.find((h) => h.host_id === host);
  const { connection, state, access, error } = useHostState(host);
  const sections = useMemo(() => chatSections(state).map((s) => ({ ...s, data: s.rows })), [state]);
  const target = newChatTarget(state.projects);
  const noUserProjects = connection.kind === "open" && sections.length > 0 && !state.projects.some(isActiveUserProject);
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
        // 見るだけの端末には作る操作を出さない（本体も断る）
        ListHeaderComponent={access === "full" && target !== null ? <Button primary label="新しいチャット" onPress={() => router.push(`${base}/new?project=${target}`)} style={{ marginHorizontal: 16, marginTop: 12 }} /> : undefined}
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
        renderSectionFooter={({ section }) =>
          isCommonProject(section.project) && section.rows.length === 0 ? <Text style={[ui.muted, { paddingHorizontal: 16, paddingVertical: 8 }]}>どのプロジェクトにも属さない相談・調べものはここで。始めたチャットは、ここに並びます。</Text> : null
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`${base}/chat/${item.chat.id}`)} style={({ pressed }) => [{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.border }, pressed && { backgroundColor: colors.hover }]}>
            <View style={ui.row}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: TONE_COLORS[STATE_LOOKS[item.state].tone] }} />
              <Text style={[ui.text, { flex: 1 }]} numberOfLines={1}>
                {item.chat.title}
              </Text>
              {item.state !== "read" && <Text style={[ui.muted, { color: TONE_COLORS[STATE_LOOKS[item.state].tone] }]}>{STATE_LOOKS[item.state].label}</Text>}
            </View>
          </Pressable>
        )}
        ListEmptyComponent={connection.kind === "open" ? <Text style={[ui.muted, { padding: 16 }]}>プロジェクトがありません</Text> : undefined}
        ListFooterComponent={noUserProjects ? <Text style={[ui.muted, { padding: 16 }]}>プロジェクトがまだありません</Text> : undefined}
      />
    </View>
  );
}
