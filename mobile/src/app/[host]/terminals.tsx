// プロジェクトのターミナルの一覧（Mac の画面で開いているタブ・このスマホで始めたもの）と、新しいシェル
import { useCallback, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import type { TerminalTab } from "@shared/types";
import { useHostState } from "../../state/useHostState";
import { Button } from "../../ui/Button";
import { colors, ui } from "../../ui/theme";

export default function TerminalsScreen() {
  const { host, project } = useLocalSearchParams<{ host: string; project: string }>();
  const router = useRouter();
  const { session, access } = useHostState(host);
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const projectId = Number(project);
  const open = (key: string) => router.push(`/${encodeURIComponent(host)}/terminal/${encodeURIComponent(key)}`);

  useFocusEffect(
    useCallback(() => {
      void session?.client
        .terminals(projectId)
        .then(setTabs)
        .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    }, [session, projectId]),
  );

  const start = async () => {
    if (!session) return;
    setBusy(true);
    try {
      open((await session.client.startTerminal(projectId, 80, 24)).key);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={ui.screen}>
      <Stack.Screen options={{ title: "ターミナル" }} />
      <FlatList
        data={tabs}
        keyExtractor={(t) => t.key}
        contentContainerStyle={ui.pad}
        ListEmptyComponent={<Text style={ui.muted}>動いているターミナルはありません</Text>}
        renderItem={({ item }) => (
          <Pressable onPress={() => open(item.key)} style={({ pressed }) => [ui.card, pressed && { backgroundColor: colors.hover }]}>
            <Text style={ui.text}>{item.title}</Text>
            <Text style={ui.muted} numberOfLines={1}>
              {item.command ?? item.cwd}
            </Text>
          </Pressable>
        )}
        ListFooterComponent={
          <View style={{ gap: 8, marginTop: 8 }}>
            {access === "full" ? <Button primary label="新しいシェルを開く" busy={busy} onPress={() => void start()} /> : <Text style={ui.muted}>この端末は「見るだけ」なので、ターミナルは見るだけです</Text>}
            {error && <Text style={ui.error}>{error}</Text>}
          </View>
        }
      />
    </View>
  );
}
