// チャット: 会話（メインエージェントの発言・ツールの 1 行・終わり）・回答待ち（承認・質問）・AI が作業場所を移す予約・送信待ち・入力欄。見るだけの端末は読むだけ。
// 見出し（チャット名）の長押しで「未読にする / 既読にする」、ボタンで既読にする設定では一番下に既読ボタン
import { useMemo } from "react";
import { Alert, FlatList, KeyboardAvoidingView, Pressable, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { ApprovalCard } from "../../../chat/ApprovalCard";
import { Composer } from "../../../chat/Composer";
import { QueueCard } from "../../../chat/QueueCard";
import { WorkplaceMoveCard } from "../../../chat/WorkplaceMoveCard";
import { MathText, VisualView } from "../../../chat/RichView";
import { useChat } from "../../../chat/useChat";
import { useReadState } from "../../../chat/useReadState";
import { READ_TOGGLE_LABELS } from "@shared/chat/readTiming";
import { PROVIDER_LABELS } from "@shared/settings/types";
import { chatRestrictions, restrictionNotice } from "@shared/chat/restrictionNotice";
import { isCommonProjectIn } from "@shared/projects/kinds";
import { timelineOf, type TimelineItem } from "../../../lib/timeline";
import { useHostState } from "../../../state/useHostState";
import { Button } from "../../../ui/Button";
import { ConnectionBanner } from "../../../ui/ConnectionBanner";
import { colors, ui } from "../../../ui/theme";

export default function ChatScreen() {
  const { host, id } = useLocalSearchParams<{ host: string; id: string }>();
  const chatId = Number(id);
  const { session, connection, state, access } = useHostState(host);
  const { chat, events, live, approvals, hasEarlier, streaming, error, loadEarlier } = useChat(session, chatId);
  const read = useReadState(session, chat, events, approvals.length > 0);
  const items = useMemo(() => timelineOf(events, chat?.provider).reverse(), [events, chat?.provider]);
  const canWrite = access === "full";
  const running = chat?.status === "running";
  const client = session?.client;
  // 共通のチャットは、チャットでオフにしても制限が効くので知らせない（パソコンの入力欄と同じ判定）
  const common = chat ? isCommonProjectIn(state.projects, chat.project_id) : false;
  const restrictions = chat ? chatRestrictions(chat, common) : null;
  const notice = restrictions ? restrictionNotice(restrictions.sandboxEnabled, restrictions.editScopeEnabled) : "";
  return (
    <KeyboardAvoidingView style={ui.screen} behavior="padding">
      <Stack.Screen
        options={{
          title: chat?.title ?? "チャット",
          headerTitle: ({ children }) => (
            <Pressable onLongPress={read.openMenu} accessibilityHint="長押しで未読にする・既読にする">
              <Text style={ui.title} numberOfLines={1}>
                {children}
              </Text>
            </Pressable>
          ),
        }}
      />
      <ConnectionBanner state={connection} />
      {error && <Text style={[ui.error, { padding: 12 }]}>{error}</Text>}
      <FlatList
        inverted
        data={items}
        keyExtractor={(item) => `${item.kind}:${item.id}`}
        contentContainerStyle={{ padding: 12, gap: 10 }}
        onScroll={read.onScroll}
        scrollEventThrottle={100}
        onScrollBeginDrag={read.onDragStart}
        onScrollEndDrag={read.onDragEnd}
        onMomentumScrollEnd={read.onMomentumEnd}
        onTouchEnd={read.onTouch}
        renderItem={({ item }) => <Item item={item} onPrompt={canWrite && client ? (t) => confirmPrompt(t, () => void client.api("POST /api/chats/:chatId/messages", { params: { chatId }, body: { text: t, when: "later" } })) : undefined} />}
        ListHeaderComponent={
          <View style={{ gap: 10 }}>
            {streaming ? <Text style={[ui.text, { opacity: 0.8 }]}>{streaming}</Text> : running ? <Text style={ui.muted}>作業中…</Text> : null}
            {approvals.map((a) => (
              <ApprovalCard key={a.id} approval={a} canAnswer={canWrite} onResolve={(d) => (client ? client.api("POST /api/approvals/:approvalId", { params: { approvalId: a.id }, body: d }) : Promise.resolve())} />
            ))}
            {live?.workplace_move && <WorkplaceMoveCard move={live.workplace_move} onCancel={canWrite && client ? () => client.api("DELETE /api/chats/:chatId/workplace-move", { params: { chatId } }) : null} />}
            {live && live.queue.messages.length > 0 && (
              <QueueCard queue={live.queue} onRemove={canWrite && client ? (queueId) => void client.api("POST /api/chats/:chatId/queue", { params: { chatId }, body: { commands: [{ op: "remove", ids: [queueId] }] } }) : null} />
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
      {read.readButton && <Button label={READ_TOGGLE_LABELS.seen} onPress={read.markSeen} style={{ marginHorizontal: 12, marginBottom: 8 }} />}
      {notice !== "" && <Text style={[ui.error, { paddingHorizontal: 12 }]}>{notice}</Text>}
      {canWrite && client ? (
        <Composer
          running={running}
          stopping={live?.stopping ?? false}
          onSend={async (t) => void (await client.api("POST /api/chats/:chatId/messages", { params: { chatId }, body: { text: t } }))}
          onTell={async (t) => void (await client.api("POST /api/chats/:chatId/messages", { params: { chatId }, body: { text: t, when: "now" } }))}
          onQueue={async (t) => void (await client.api("POST /api/chats/:chatId/messages", { params: { chatId }, body: { text: t, when: "later" } }))}
          onCancel={() => client.api("POST /api/chats/:chatId/cancel", { params: { chatId } })}
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
      return (
        <View>
          {item.provider && <Text style={[ui.muted, { fontSize: 11 }]}>{PROVIDER_LABELS[item.provider]}</Text>}
          {item.math ? <MathText text={item.text} /> : <Text style={ui.text} selectable>{item.text}</Text>}
        </View>
      );
    case "visual":
      return item.visual ? <VisualView visual={item.visual} onPrompt={onPrompt} /> : <Text style={[ui.muted, { textAlign: "center" }]}>{item.text}</Text>;
    case "tool":
      return (
        <Text style={[ui.muted, { fontFamily: "monospace" }]} numberOfLines={2}>
          {item.state === "running" ? "…" : item.state === "ok" ? "✓" : "✕"} {item.summary ? `${item.name}: ${item.summary}` : item.name}
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
