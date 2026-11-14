import { ActivityIndicator, Pressable, Text, type StyleProp, type ViewStyle } from "react-native";
import { colors, ui } from "./theme";

interface ButtonProps {
  label: string;
  onPress: () => void;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** ボタン（押している間は少し暗く。busy の間は回る印） */
export function Button({ label, onPress, primary, danger, disabled, busy, style }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [ui.button, primary && ui.buttonPrimary, danger && { backgroundColor: colors.ng }, (pressed || disabled) && { opacity: 0.6 }, style]}
    >
      {busy ? <ActivityIndicator color={colors.text} /> : <Text style={ui.buttonText}>{label}</Text>}
    </Pressable>
  );
}
