// チャット: 会話（メインエージェントの発言・ツールの 1 行・終わり）・回答待ち（承認・質問）・送信待ち・入力欄。見るだけの端末は読むだけ
import { useMemo } from "react";
import { Alert, FlatList, KeyboardAvoidingView, Pressable, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { ApprovalCard } from "../../../chat/ApprovalCard";
import { Composer } from "../../../chat/Composer";
import { MathText, VisualView } from "../../../chat/RichView";
import { useChat } from "../../../chat/useChat";
import { timelineOf, type TimelineItem } from "../../../lib/timeline";
import { useHostState } from "../../../state/useHostState";
import { ConnectionBanner } from "../../../ui/ConnectionBanner";
import { colors, ui } from "../../../ui/theme";

export default function ChatScreen() {
  const { host, id } = useLocalSearchParams<{ host: string; id: string }>();
  const chatId = Number(id);
  const { session, connection, access } = useHostState(host);
  const { chat, events, live, approvals, hasEarlier, streaming, error, loadEarlier } = useChat(session, chatId);
  const items = useMemo(() => timelineOf(events).reverse(), [events]);
  const canWrite = access === "full";
  const running = chat?.status === "running";
  const client = session?.client;
  return (
    <KeyboardAvoidingView style={ui.screen} behavior="padding">
      <Stack.Screen options={{ title: chat?.title ?? "チャット" }} />
      <ConnectionBanner state={connection} />
      {error && <Text style={[ui.error, { padding: 12 }]}>{error}</Text>}
      <FlatList
        inverted
        data={items}
        keyExtractor={(item) => `${item.kind}:${item.id}`}
        contentContainerStyle={{ padding: 12, gap: 10 }}
        renderItem={({ item }) => <Item item={item} onPrompt={canWrite && client ? (t) => confirmPrompt(t, () => void client.queue(chatId, t)) : undefined} />}
        ListHeaderComponent={
          <View style={{ gap: 10 }}>
            {streaming ? <Text style={[ui.text, { opacity: 0.8 }]}>{streaming}</Text> : running ? <Text style={ui.muted}>作業中…</Text> : null}
            {approvals.map((a) => (
              <ApprovalCard key={a.id} approval={a} canAnswer={canWrite} onResolve={(d) => (client ? client.resolveApproval(a.id, d) : Promise.resolve())} />
            ))}
            {live && live.queue.messages.length > 0 && (
              <View style={ui.card}>
                <Text style={ui.muted}>送信待ち {live.queue.messages.length} 件{live.queue.paused ? "（一時停止中）" : ""}</Text>
                {live.queue.messages.map((m) => (
                  <View key={m.id} style={ui.row}>
                    <Text style={[ui.text, { flex: 1 }]} numberOfLines={2}>
                      {m.text || "（添付だけ）"}
                    </Text>
                    {canWrite && (
                      <Pressable onPress={() => void client?.removeQueued(chatId, m.id)} hitSlop={8}>
                        <Text style={{ color: colors.ng }}>外す</Text>
                      </Pressable>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>
        }
        ListFooterComponent={
          hasEarlier ? (
            <Pressable onPress={() => void loadEarlier()} style={{ padding: 12, alignItems: "center" }}>
              <Text style={{ color: colors.accent }}>さらに前を読む</Text>
            </Pressable>
          ) : undefined
        }
      />
      {canWrite && client ? (
        <Composer
          running={running}
          stopping={live?.stopping ?? false}
          onSend={async (t) => void (await client.send(chatId, t))}
          onTell={async (t) => void (await client.tell(chatId, t))}
          onQueue={async (t) => void (await client.queue(chatId, t))}
          onCancel={() => client.cancel(chatId)}
        />
      ) : (
        <Text style={[ui.muted, { padding: 12 }]}>この端末は「見るだけ」です（Mac の Kickoff の設定の「スマホ連携」で変えられます）</Text>
      )}
    </KeyboardAvoidingView>
  );
}

/**
 * 図の中のボタンから届いた発言を、確かめてから送る（作業していなければすぐ送り、作業中なら送信待ちに入れる = queue）。
 * 押したかは中のページも見るが、WebView では外から確かめられないので、送る前に文を見せて聞く
 */
function confirmPrompt(text: string, send: () => void) {
  Alert.alert("図から送る", text.length > 300 ? `${text.slice(0, 300)}…` : text, [
    { text: "やめる", style: "cancel" },
    { text: "送る", onPress: send },
  ]);
}

/** 1 行。onPrompt: 図の中のボタンから届いた発言を送る（見るだけの端末では送らない） */
function Item({ item, onPrompt }: { item: TimelineItem; onPrompt?: (text: string) => void }) {
  switch (item.kind) {
    case "user":
      return (
        <View style={{ alignSelf: "flex-end", maxWidth: "88%", backgroundColor: colors.hover, borderRadius: 12, padding: 10 }}>
          {item.note && <Text style={[ui.muted, { fontSize: 11 }]}>{item.note}</Text>}
          <Text style={ui.text}>{item.text}</Text>
        </View>
      );
    case "assistant":
      // 数式を含む返答は WebView で（数式だけを KaTeX で描く）
      if (item.math) return <MathText text={item.text} />;
      return (
        <Text style={ui.text} selectable>
          {item.text}
        </Text>
      );
    case "visual":
      return item.visual ? <VisualView visual={item.visual} onPrompt={onPrompt} /> : <Text style={[ui.muted, { textAlign: "center" }]}>{item.text}</Text>;
    case "tool":
      return (
        <Text style={[ui.muted, { fontFamily: "monospace" }]} numberOfLines={2}>
          {item.state === "running" ? "…" : item.state === "ok" ? "✓" : "✕"} {item.name}: {item.summary}
        </Text>
      );
    case "answer":
      return (
        <View style={{ alignSelf: "flex-end", maxWidth: "88%", backgroundColor: colors.hover, borderRadius: 12, padding: 10 }}>
          <Text style={[ui.muted, { fontSize: 11 }]}>質問への回答</Text>
          <Text style={ui.text}>{item.text}</Text>
        </View>
      );
    case "end":
      return (
        <Text style={[ui.muted, { textAlign: "center" }]}>
          — {item.status}
          {item.text ? `: ${item.text}` : ""} —
        </Text>
      );
    case "notice":
      return <Text style={[ui.muted, { textAlign: "center" }]}>{item.text}</Text>;
  }
}
