// ターミナル: 本体のシェルに WebSocket でつなぎ（Mac の画面のタブと同じシェルにもつなげる）、WebView の中の xterm.js に描く。
// 見るだけの端末は打てない（本体も入力を捨てる）。下の帯に、スマホのキーボードにないキー（Esc・Tab・Ctrl+C・矢印）
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { WebView } from "react-native-webview";
import type { TerminalClientMessage, TerminalServerMessage } from "@shared/types";
import { authHeaders } from "../../../lib/client";
import { useHostState } from "../../../state/useHostState";
import { terminalPageHtml, type TerminalPageMessage } from "../../../terminal/terminalPage";
import { Button } from "../../../ui/Button";
import { colors, ui } from "../../../ui/theme";

// WebView の型は、既定の型の引数（undefined）だと props が never になる（react-native-webview 14 の型の都合）ので、空の追加の props で使う
const TerminalWebView = WebView<object>;

/** React Native の WebSocket は 3 つ目の引数で見出しを付けられる（型は DOM の WebSocket が先に効くので書き直す） */
type NativeWebSocket = new (url: string, protocols: string | string[] | null, options: { headers: Record<string, string> }) => WebSocket;

/** スマホのキーボードにないキー */
const KEYS: { label: string; data: string }[] = [
  { label: "Esc", data: "\x1b" },
  { label: "Tab", data: "\t" },
  { label: "Ctrl+C", data: "\x03" },
  { label: "Ctrl+D", data: "\x04" },
  { label: "↑", data: "\x1b[A" },
  { label: "↓", data: "\x1b[B" },
  { label: "←", data: "\x1b[D" },
  { label: "→", data: "\x1b[C" },
];

export default function TerminalScreen() {
  const { host, key } = useLocalSearchParams<{ host: string; key: string }>();
  const router = useRouter();
  const { session, access } = useHostState(host);
  const web = useRef<WebView<object>>(null);
  const socket = useRef<WebSocket | null>(null);
  const [size, setSize] = useState<{ cols: number; rows: number } | null>(null);
  const [status, setStatus] = useState("つないでいます…");
  const readOnly = access !== "full";
  const html = useMemo(() => terminalPageHtml({ readOnly, background: colors.bg, foreground: colors.text }), [readOnly]);

  const call = (fn: string, arg: string | number) => web.current?.injectJavaScript(`window.kickoffTerminal && window.kickoffTerminal.${fn}(${JSON.stringify(arg)}); true;`);
  const send = (m: TerminalClientMessage) => {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify(m));
  };

  // ページの大きさが分かったらつなぐ（スマホが始めたシェルなら、その大きさにする。Mac の画面のタブは変えない = 本体が決める）
  useEffect(() => {
    if (!session || !size || socket.current) return;
    const ws = new (WebSocket as unknown as NativeWebSocket)(session.client.terminalSocketUrl(key, size.cols, size.rows), null, { headers: authHeaders(session.client.access.token) });
    socket.current = ws;
    ws.onopen = () => setStatus("");
    ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data)) as TerminalServerMessage;
      if (m.type === "snapshot") call("reset", m.data);
      else if (m.type === "data") call("write", m.data);
      else {
        call("exit", m.exit_code);
        setStatus("シェルが終わりました");
      }
    };
    ws.onclose = () => setStatus((s) => s || "切れました");
    ws.onerror = () => setStatus("つなげません");
    return () => {
      ws.close();
      socket.current = null;
    };
  }, [session, key, size]);

  const onMessage = (raw: string) => {
    const m = JSON.parse(raw) as TerminalPageMessage;
    if (m.type === "size") {
      if (socket.current) send({ type: "resize", cols: m.cols, rows: m.rows });
      else setSize({ cols: m.cols, rows: m.rows });
    } else if (m.type === "input" && !readOnly) send({ type: "input", data: m.data });
  };

  const close = async () => {
    await session?.client.closeTerminal(key).catch(() => {});
    router.back();
  };

  return (
    <View style={ui.screen}>
      <Stack.Screen options={{ title: "ターミナル" }} />
      {status ? <Text style={[ui.muted, { padding: 8 }]}>{status}</Text> : null}
      <TerminalWebView ref={web} originWhitelist={["*"]} source={{ html }} onMessage={(e) => onMessage(e.nativeEvent.data)} style={{ flex: 1, backgroundColor: colors.bg }} keyboardDisplayRequiresUserAction={false} />
      {!readOnly && (
        <ScrollView horizontal style={{ flexGrow: 0, borderTopWidth: 1, borderColor: colors.border }} contentContainerStyle={{ padding: 6, gap: 6 }}>
          {KEYS.map((k) => (
            <Pressable key={k.label} onPress={() => send({ type: "input", data: k.data })} style={[ui.button, { paddingVertical: 6 }]}>
              <Text style={ui.buttonText}>{k.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
      {readOnly ? (
        <Text style={[ui.muted, { padding: 10 }]}>この端末は「見るだけ」なので、打てません</Text>
      ) : key.startsWith("api:") ? (
        <Button label="このシェルを閉じる" danger onPress={() => void close()} style={{ margin: 8 }} />
      ) : null}
    </View>
  );
}
