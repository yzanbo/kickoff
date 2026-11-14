import { Text, View } from "react-native";
import { isFinal, type SessionState } from "../lib/connection";
import { colors, sessionStateText } from "./theme";

/** つながっていないときの帯（つながっていれば何も出さない） */
export function ConnectionBanner({ state }: { state: SessionState }) {
  const text = sessionStateText(state);
  if (!text) return null;
  const bad = isFinal(state) || state.kind === "mobile_off";
  return (
    <View style={{ backgroundColor: bad ? colors.ng : colors.warn, paddingHorizontal: 12, paddingVertical: 6 }}>
      <Text style={{ color: "#111", fontSize: 13 }}>{text}</Text>
    </View>
  );
}
