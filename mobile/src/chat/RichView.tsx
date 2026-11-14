// 数式を含む返答と AI が描いた図を、高さを中身に合わせた WebView に描く（ページは lib/richPages.ts）。
// 中のリンク・移動は WebView の中で開かない（最初のページを読んだあとは、data: などの CSP のないページへも移らせない）。
// 図の中のボタンから届く発言（sendPrompt。利用者が押したときだけ）は onPrompt へ
import { useRef, useState } from "react";
import { Linking, Text, View, useWindowDimensions } from "react-native";
import { WebView } from "react-native-webview";
import { VISUAL_KIND_LABELS, type ChatVisual } from "@shared/chat/aiVisual";
import { VISUAL_MESSAGES } from "@shared/chat/visualDocument";
import { mathPage, mermaidPage, visualPage } from "../lib/richPages";
import { colors, ui } from "../ui/theme";

// WebView の型は、既定の型の引数だと props が never になる（react-native-webview 14 の型の都合）ので、空の追加の props で使う
const PageWebView = WebView<object>;

/** 図の高さの上限（画面の高さに対する割合。超えたら WebView の中でスクロール。パソコンと同じ） */
const MAX_HEIGHT_RATIO = 0.8;

/** 中身の高さに合わせた WebView（届くまでは minHeight） */
function AutoHeightPage({ html, minHeight, onPrompt, onError }: { html: string; minHeight: number; onPrompt?: (text: string) => void; onError?: (message: string) => void }) {
  const [height, setHeight] = useState(minHeight);
  const maxHeight = Math.round(useWindowDimensions().height * MAX_HEIGHT_RATIO);
  // 最初のページ（source の html）を読み終えたか。読み終えたあとの移動は、どこへも通さない
  const loaded = useRef(false);
  return (
    <PageWebView
      originWhitelist={["*"]}
      source={{ html }}
      style={{ height: Math.min(height, maxHeight), backgroundColor: colors.bg }}
      scrollEnabled={height > maxHeight}
      onLoadEnd={() => {
        loaded.current = true;
      }}
      // 中のリンク・移動は WebView の中で開かず、押した外へのリンクだけブラウザで開く。最初のページの読み込みだけ通す
      // （中のスクリプトが data: のページへ移ると、CSP のないページになって決めた CDN のほかへも通信できてしまうため）
      onShouldStartLoadWithRequest={(req) => {
        if (!loaded.current && req.isTopFrame && (req.url === "about:blank" || req.url.startsWith("data:"))) return true;
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
  const maxHeight = Math.round(useWindowDimensions().height * MAX_HEIGHT_RATIO);
  const html = visual.kind === "mermaid" ? mermaidPage(visual.code) : visualPage(visual.kind, visual.code, maxHeight);
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
