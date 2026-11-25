// 新しいチャット（作成先の本体で、作成先の既定の選択で始める。共通なら共通の作業フォルダ）。送る前に作成先を札で変えられる
import { useEffect, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import type { Project } from "@shared/projects/types";
import { ChatTargetPicker } from "../../chat/ChatTargetPicker";
import { useHostSession } from "../../state/hosts";
import { Button } from "../../ui/Button";
import { ui } from "../../ui/theme";

export default function NewChatScreen() {
  const { host, project } = useLocalSearchParams<{ host: string; project: string }>();
  const router = useRouter();
  const { session } = useHostSession(host);
  const [target, setTarget] = useState(Number(project));
  const [projects, setProjects] = useState<Project[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 作成先の選択肢（読めなくても、URL の作成先でそのまま始められる）
  useEffect(() => {
    void session?.client
      .api("GET /api/projects")
      .then(setProjects)
      .catch(() => {});
  }, [session]);
  const start = async () => {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const chat = await session.client.api("POST /api/projects/:projectId/chats", { params: { projectId: target }, body: { text: text.trim() } });
      router.replace(`/${encodeURIComponent(host)}/chat/${chat.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  return (
    <View style={[ui.screen, ui.pad]}>
      <Stack.Screen options={{ title: "新しいチャット" }} />
      <ChatTargetPicker projects={projects} value={target} onPick={setTarget} />
      <TextInput style={[ui.input, { minHeight: 140, textAlignVertical: "top" }]} multiline autoFocus placeholder="最初の指示を書く" placeholderTextColor="#666" value={text} onChangeText={setText} />
      <Button primary label="始める" disabled={!text.trim()} busy={busy} onPress={() => void start()} />
      {error && <Text style={ui.error}>{error}</Text>}
    </View>
  );
}
