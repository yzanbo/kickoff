// 数式を含む返答と AI が描いた図を、高さを中身に合わせた WebView に描く（ページは lib/richPages.ts）。
// 中のリンク・移動は WebView の中で開かない。図の中のボタンから届く発言（sendPrompt。利用者が押したときだけ）は onPrompt へ
import { useState } from "react";
import { Linking, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { VISUAL_KIND_LABELS, type ChatVisual } from "@shared/chat/aiVisual";
import { VISUAL_MESSAGES } from "@shared/chat/visualDocument";
import { mathPage, mermaidPage, visualPage } from "../lib/richPages";
import { colors, ui } from "../ui/theme";

// WebView の型は、既定の型の引数だと props が never になる（react-native-webview 14 の型の都合）ので、空の追加の props で使う
const PageWebView = WebView<object>;

/** 図の高さの上限（超えたら WebView の中でスクロール） */
const MAX_HEIGHT = 600;

/** 中身の高さに合わせた WebView（届くまでは minHeight） */
function AutoHeightPage({ html, minHeight, onPrompt, onError }: { html: string; minHeight: number; onPrompt?: (text: string) => void; onError?: (message: string) => void }) {
  const [height, setHeight] = useState(minHeight);
  return (
    <PageWebView
      originWhitelist={["*"]}
      source={{ html }}
      style={{ height: Math.min(height, MAX_HEIGHT), backgroundColor: colors.bg }}
      scrollEnabled={height > MAX_HEIGHT}
      // 中のリンク・移動は WebView の中で開かず、外へのリンクだけブラウザで開く（最初のページの読み込みは通す）
      onShouldStartLoadWithRequest={(req) => {
        if (req.url === "about:blank" || req.url.startsWith("data:")) return true;
        if (/^https?:/.test(req.url) && req.isTopFrame && req.navigationType === "click") void Linking.openURL(req.url);
        return false;
      }}
      onMessage={(e) => {
        let data: { type?: unknown; height?: unknown; text?: unknown; message?: unknown };
        try {
          data = JSON.parse(e.nativeEvent.data) as typeof data;
        } catch {
          return;
        }
        if (data.type === VISUAL_MESSAGES.size && typeof data.height === "number") setHeight(Math.max(minHeight, Math.ceil(data.height)));
        else if (data.type === VISUAL_MESSAGES.prompt && typeof data.text === "string" && data.text.trim()) onPrompt?.(data.text);
        else if (data.type === VISUAL_MESSAGES.error && typeof data.message === "string") onError?.(data.message);
      }}
    />
  );
}

/** 数式を含む返答（文はそのまま、数式だけを KaTeX で） */
export function MathText({ text }: { text: string }) {
  return <AutoHeightPage html={mathPage(text)} minHeight={22} />;
}

/** AI が描いた図（題名・種類と中身。Mermaid も WebView で描く） */
export function VisualView({ visual, onPrompt }: { visual: ChatVisual; onPrompt?: (text: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  const html = visual.kind === "mermaid" ? mermaidPage(visual.code) : visualPage(visual.kind, visual.code);
  return (
    <View style={[ui.card, { padding: 0, gap: 0, overflow: "hidden" }]}>
      <View style={[ui.row, { paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderColor: colors.border }]}>
        <Text style={[ui.text, { fontWeight: "600", flexShrink: 1 }]} numberOfLines={1}>
          {visual.title ?? "図"}
        </Text>
        <Text style={ui.muted}>{VISUAL_KIND_LABELS[visual.kind]}</Text>
        {visual.updatedBy.length > 0 && <Text style={ui.muted}>描き直し {visual.updatedBy.length} 回</Text>}
      </View>
      <AutoHeightPage key={visual.code} html={html} minHeight={80} onPrompt={onPrompt} onError={setError} />
      {error && <Text style={[ui.error, { padding: 10 }]}>{error}</Text>}
    </View>
  );
}
