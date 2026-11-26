// ボタンで既読にする設定で、一番下まで来たときに入力欄の上に出すもの（決めるのはパソコンと同じ readPillOf）。
// 未読なら既読ボタン。既読になったら消さずに、押せない「既読」の表示にする（押したのが効いたと分かるように。未読に戻すのは見出しの長押し）
import { Text, View } from "react-native";
import { READ_DONE_LABEL, READ_TOGGLE_LABELS, type ReadPillKind } from "@shared/chat/readTiming";
import { Button } from "../ui/Button";
import { colors, ui } from "../ui/theme";

const PLACE = { marginHorizontal: 12, marginBottom: 8 } as const;

export function ReadPill({ kind, onPress }: { kind: ReadPillKind; onPress: () => void }) {
  if (kind === "unread") return <Button label={READ_TOGGLE_LABELS.seen} onPress={onPress} style={PLACE} />;
  return (
    // 既読ボタンと同じ高さ（枠の 1px ずつを上下の余白から引く）にして、替わっても上の流れの高さを変えない
    <View style={[ui.button, PLACE, { paddingVertical: 9, backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border }]} accessible accessibilityLabel={READ_DONE_LABEL}>
      <Text style={[ui.buttonText, { color: colors.muted, fontWeight: "400" }]}>✓ {READ_DONE_LABEL}</Text>
    </View>
  );
}
