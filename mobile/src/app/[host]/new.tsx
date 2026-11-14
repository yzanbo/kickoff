// 新しいチャット（プロジェクトの本体で、プロジェクトの既定の選択で始める）
import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useHostSession } from "../../state/hosts";
import { Button } from "../../ui/Button";
import { ui } from "../../ui/theme";

export default function NewChatScreen() {
  const { host, project } = useLocalSearchParams<{ host: string; project: string }>();
  const router = useRouter();
  const { session } = useHostSession(host);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const start = async () => {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const chat = await session.client.startChat(Number(project), text.trim());
      router.replace(`/${encodeURIComponent(host)}/chat/${chat.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  return (
    <View style={[ui.screen, ui.pad]}>
      <Stack.Screen options={{ title: "新しいチャット" }} />
      <TextInput style={[ui.input, { minHeight: 140, textAlignVertical: "top" }]} multiline autoFocus placeholder="最初の指示を書く" placeholderTextColor="#666" value={text} onChangeText={setText} />
      <Button primary label="始める" disabled={!text.trim()} busy={busy} onPress={() => void start()} />
      {error && <Text style={ui.error}>{error}</Text>}
    </View>
  );
}
