// 新しいチャットの作成先を選び直す札（共通・各プロジェクト。並びと選択肢はパソコンの札と同じ chatTargetChoices）
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { chatTargetChoices } from "@shared/projects/order";
import type { Project } from "@shared/projects/types";
import { colors, ui } from "../ui/theme";

interface Props {
  projects: readonly Project[];
  value: number;
  onPick: (projectId: number) => void;
}

/** 札（押すと下に選択肢を開く。選んだら閉じる）。一覧が届く前は札だけ（選択肢がない） */
export function ChatTargetPicker({ projects, value, onPick }: Props) {
  const [open, setOpen] = useState(false);
  const { values, labels } = chatTargetChoices(projects, value);
  return (
    <View style={{ gap: 6 }}>
      <View style={ui.row}>
        <Text style={ui.muted}>作成先</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="作成先を変える"
          disabled={values.length === 0}
          onPress={() => setOpen((o) => !o)}
          hitSlop={8}
          style={({ pressed }) => [{ borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 }, pressed && { backgroundColor: colors.hover }]}
        >
          <Text style={ui.text}>{`${labels[String(value)] ?? "…"} ▾`}</Text>
        </Pressable>
      </View>
      {open && (
        <View style={ui.card}>
          {values.map((id) => (
            <Pressable
              key={id}
              onPress={() => {
                setOpen(false);
                onPick(Number(id));
              }}
              style={({ pressed }) => [ui.row, { paddingVertical: 8 }, pressed && { backgroundColor: colors.hover }]}
            >
              <Text style={[ui.text, { width: 18, color: colors.accent }]}>{id === String(value) ? "✓" : ""}</Text>
              <Text style={[ui.text, { flex: 1 }]} numberOfLines={1}>
                {labels[id]}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
