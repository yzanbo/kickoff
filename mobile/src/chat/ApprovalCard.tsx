// 回答待ちのカード（ツールの承認・AI からの質問・再開の確かめ）。見るだけの端末では答えられない
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import type { Approval, ApprovalDecision, Question } from "@shared/types";
import { toolSummary } from "../lib/timeline";
import { Button } from "../ui/Button";
import { colors, ui } from "../ui/theme";

interface Props {
  approval: Approval;
  canAnswer: boolean;
  onResolve: (decision: ApprovalDecision) => Promise<void>;
}

export function ApprovalCard({ approval, canAnswer, onResolve }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resolve = async (decision: ApprovalDecision) => {
    setBusy(true);
    setError(null);
    try {
      await onResolve(decision);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  if (approval.kind === "question") return <QuestionCard approval={approval} canAnswer={canAnswer} busy={busy} error={error} onAnswer={(answers) => void resolve({ action: "answer", answers })} />;
  const title = approval.title ?? (approval.kind === "permission" ? `${approval.tool_name} を使ってよいですか？` : approval.kind === "reconnect" ? "通信が戻りました。続けますか？" : "使用枠が戻りました。続けますか？");
  return (
    <View style={[ui.card, { borderColor: colors.warn }]}>
      <Text style={ui.title}>{title}</Text>
      {approval.kind === "permission" && <Text style={[ui.muted, { fontFamily: "monospace" }]}>{toolSummary(approval.tool_name, approval.input)}</Text>}
      {approval.description && <Text style={ui.muted}>{approval.description}</Text>}
      {canAnswer ? (
        <View style={[ui.row, { marginTop: 6 }]}>
          <Button label="断る" onPress={() => void resolve({ action: "deny" })} disabled={busy} style={{ flex: 1 }} />
          <Button primary label={approval.kind === "permission" ? "許可する" : "続ける"} onPress={() => void resolve({ action: "allow" })} busy={busy} style={{ flex: 1 }} />
        </View>
      ) : (
        <Text style={ui.muted}>この端末は「見るだけ」なので答えられません</Text>
      )}
      {error && <Text style={ui.error}>{error}</Text>}
    </View>
  );
}

/** AI からの質問（AskUserQuestion）。選択肢を選び（複数選べるものもある）、なければ「その他」に書く。回答の鍵は質問の文 */
function QuestionCard({ approval, canAnswer, busy, error, onAnswer }: { approval: Approval; canAnswer: boolean; busy: boolean; error: string | null; onAnswer: (answers: Record<string, string | string[]>) => void }) {
  const questions = (approval.input.questions as Question[] | undefined) ?? [];
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [other, setOther] = useState<Record<string, string>>({});
  const toggle = (q: Question, label: string) =>
    setPicked((p) => {
      const now = p[q.question] ?? [];
      const next = q.multiSelect ? (now.includes(label) ? now.filter((l) => l !== label) : [...now, label]) : [label];
      return { ...p, [q.question]: next };
    });
  const answers: Record<string, string | string[]> = {};
  for (const q of questions) {
    const values = [...(picked[q.question] ?? []), ...(other[q.question]?.trim() ? [other[q.question].trim()] : [])];
    if (values.length > 0) answers[q.question] = q.multiSelect ? values : values[values.length - 1];
  }
  const complete = questions.length > 0 && questions.every((q) => answers[q.question] !== undefined);
  return (
    <View style={[ui.card, { borderColor: colors.warn, gap: 12 }]}>
      <Text style={ui.title}>AI からの質問</Text>
      {questions.map((q) => (
        <View key={q.question} style={{ gap: 6 }}>
          <Text style={ui.text}>{q.question}</Text>
          {q.multiSelect && <Text style={ui.muted}>いくつでも選べます</Text>}
          {q.options.map((o) => {
            const on = (picked[q.question] ?? []).includes(o.label);
            return (
              <Pressable key={o.label} disabled={!canAnswer} onPress={() => toggle(q, o.label)} style={[ui.card, { padding: 10, backgroundColor: on ? colors.hover : colors.bg, borderColor: on ? colors.accent : colors.border }]}>
                <Text style={ui.text}>{o.label}</Text>
                {o.description ? <Text style={ui.muted}>{o.description}</Text> : null}
              </Pressable>
            );
          })}
          {canAnswer && <TextInput style={ui.input} placeholder="その他（自分で書く）" placeholderTextColor="#666" value={other[q.question] ?? ""} onChangeText={(t) => setOther((o) => ({ ...o, [q.question]: t }))} />}
        </View>
      ))}
      {canAnswer ? <Button primary label="答える" disabled={!complete} busy={busy} onPress={() => onAnswer(answers)} /> : <Text style={ui.muted}>この端末は「見るだけ」なので答えられません</Text>}
      {error && <Text style={ui.error}>{error}</Text>}
    </View>
  );
}
