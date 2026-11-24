// AI が作業場所を移す予約のカード（取り消すと移らない。見るだけの端末は見えるだけ）
import { Alert, Pressable, Text, View } from "react-native";
import type { WorkplaceMoveReservation } from "@shared/chat/chatLive";
import { workplaceMoveReservationText } from "@shared/workplaceMove/aiWorkplace";
import { colors, ui } from "../ui/theme";

export function WorkplaceMoveCard({ move, onCancel }: { move: WorkplaceMoveReservation; onCancel: (() => Promise<void>) | null }) {
  return (
    <View style={[ui.card, ui.row]}>
      <Text style={[ui.text, { flex: 1 }]}>{workplaceMoveReservationText(move)}</Text>
      {onCancel && (
        <Pressable onPress={() => void onCancel().catch((e: unknown) => Alert.alert("取り消せませんでした", e instanceof Error ? e.message : String(e)))} hitSlop={8}>
          <Text style={{ color: colors.ng }}>移らない</Text>
        </Pressable>
      )}
    </View>
  );
}
