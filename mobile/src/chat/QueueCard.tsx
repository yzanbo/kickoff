// 送信待ちのカード（並んでいる指示と、外すボタン。見るだけの端末は見えるだけ）
import { Pressable, Text, View } from "react-native";
import type { QueueState } from "@shared/chat/chatLive";
import { colors, ui } from "../ui/theme";

export function QueueCard({ queue, onRemove }: { queue: QueueState; onRemove: ((queueId: string) => void) | null }) {
  return (
    <View style={ui.card}>
      <Text style={ui.muted}>送信待ち {queue.messages.length} 件{queue.paused ? "（一時停止中）" : ""}</Text>
      {queue.messages.map((m) => (
        <View key={m.id} style={ui.row}>
          <Text style={[ui.text, { flex: 1 }]} numberOfLines={2}>
            {m.text || "（添付だけ）"}
          </Text>
          {onRemove && (
            <Pressable onPress={() => onRemove(m.id)} hitSlop={8}>
              <Text style={{ color: colors.ng }}>外す</Text>
            </Pressable>
          )}
        </View>
      ))}
    </View>
  );
}
