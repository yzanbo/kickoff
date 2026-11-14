// チャットの入力欄: 作業していなければ送る。作業中なら「伝える」（止めずにいまの作業に伝える）か「送信待ちへ」（終わってから送る）、それと止める
import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { Button } from "../ui/Button";
import { ui } from "../ui/theme";

interface Props {
  running: boolean;
  stopping: boolean;
  onSend: (text: string) => Promise<void>;
  onTell: (text: string) => Promise<void>;
  onQueue: (text: string) => Promise<void>;
  onCancel: () => Promise<void>;
}

export function Composer({ running, stopping, onSend, onTell, onQueue, onCancel }: Props) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (name: string, fn: () => Promise<void>, clear = true) => {
    setBusy(name);
    setError(null);
    try {
      await fn();
      if (clear) setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const t = text.trim();
  return (
    <View style={{ padding: 10, gap: 8, borderTopWidth: 1, borderColor: "#363d40" }}>
      <TextInput style={[ui.input, { maxHeight: 140 }]} multiline placeholder={running ? "作業中に伝える・送信待ちに入れる" : "指示を書く"} placeholderTextColor="#666" value={text} onChangeText={setText} />
      <View style={ui.row}>
        {running ? (
          <>
            <Button label={stopping ? "止めています…" : "止める"} danger disabled={stopping} busy={busy === "cancel"} onPress={() => void run("cancel", onCancel, false)} />
            <Button label="送信待ちへ" disabled={!t} busy={busy === "queue"} onPress={() => void run("queue", () => onQueue(t))} style={{ flex: 1 }} />
            <Button primary label="伝える" disabled={!t} busy={busy === "tell"} onPress={() => void run("tell", () => onTell(t))} style={{ flex: 1 }} />
          </>
        ) : (
          <Button primary label="送る" disabled={!t} busy={busy === "send"} onPress={() => void run("send", () => onSend(t))} style={{ flex: 1 }} />
        )}
      </View>
      {error && <Text style={ui.error}>{error}</Text>}
    </View>
  );
}
