import { CodeXml, Eye, Maximize2, RotateCcw, StickyNote, TriangleAlert } from "lucide-react";
import { memo, useState } from "react";
import { AI_UPDATE_VISUAL_TOOL, VISUAL_KIND_LABELS, type ChatVisual } from "@shared/chat/aiVisual";
import { errorMessage } from "@shared/errors";
import { CopyButton } from "@/ui/CopyButton";
import { HighlightedCode } from "@/ui/HighlightedCode";
import { IconButton } from "@/ui/IconButton";
import { ImageViewer } from "@/ui/imageViewer/ImageViewer";
import { MermaidDiagram } from "@/ui/markdown/mermaid/MermaidDiagram";
import { reportFailure } from "@/ui/dialogs";
import { useOptionalChatPane } from "@/features/chat/pane/chatPaneContext";
import type { ToolCall } from "@/features/chat/timeline/timelineItems";
import { saveVisualToMemo } from "./saveVisual";
import { VisualFrame } from "./VisualFrame";
import { useChatVisuals } from "./visualsContext";

/** 図の高さの上限（画面の高さに対する割合。超えたら枠の中でスクロール） */
const MAX_HEIGHT_RATIO = 0.8;

/** ソースの色付けの言語 */
const SOURCE_LANG = { svg: "xml", html: "html", mermaid: undefined } as const;

const titleOf = (input: unknown) => {
  const title = (input as { title?: unknown } | null)?.title;
  return typeof title === "string" && title.trim() ? title.trim() : null;
};

/**
 * 流れの中の図の項目（AI の show_visual / update_visual）。描いた呼び出しの位置に、いちばん新しい中身の図を出す。
 * 描き直しの呼び出しの位置には 1 行だけ（押すと元の図へ移る）。中身を書き終えるまでは「図を描いています…」、失敗は理由
 */
function VisualItem({ call }: { call: ToolCall }) {
  const visuals = useChatVisuals();
  const { use, result } = call;
  const update = use.data.name === AI_UPDATE_VISUAL_TOOL;
  if (!result) return <VisualNote busy text={update ? "図を描き直しています…" : `図を描いています…${titleOf(use.data.input) ? `（${titleOf(use.data.input)}）` : ""}`} />;
  if (result.data.is_error) return <VisualNote failed text={`${update ? "図を描き直せませんでした" : "図を描けませんでした"}: ${result.data.content}`} />;
  const id = visuals.byCall.get(use.data.id);
  const visual = id !== undefined ? visuals.byId.get(id) : undefined;
  if (!visual) return null;
  if (update) return <UpdatedRow visual={visual} />;
  return <VisualCard visual={visual} eventId={use.id} />;
}

export const MemoVisualItem = memo(VisualItem, (a, b) => a.call.use === b.call.use && a.call.result === b.call.result);

/** 描いている途中・失敗の 1 行 */
function VisualNote({ text, busy = false, failed = false }: { text: string; busy?: boolean; failed?: boolean }) {
  return (
    <div className={failed ? "visual-note failed" : "visual-note"} aria-busy={busy}>
      {failed ? <TriangleAlert size={14} aria-hidden /> : <span className="spinner" aria-hidden />}
      <span>{text}</span>
    </div>
  );
}

/** 描き直した位置の 1 行（押すと元の図へ移る） */
function UpdatedRow({ visual }: { visual: ChatVisual }) {
  const pane = useOptionalChatPane();
  const { shownEvent } = useChatVisuals();
  const target = shownEvent.get(visual.id);
  const name = visual.title ? `「${visual.title}」` : "図";
  return (
    <div className="visual-note">
      <RotateCcw size={14} aria-hidden />
      {pane && target !== undefined ? (
        <button type="button" className="link-button hover-bg" onClick={() => pane.jumpTo(target)} title="元の図へ移る">
          {name}を描き直しました
        </button>
      ) : (
        <span>{name}を描き直しました</span>
      )}
    </div>
  );
}

/** 図のカード（上の帯: 題名・種類・ソース・コピー・全画面・メモに保存） */
function VisualCard({ visual, eventId }: { visual: ChatVisual; eventId: number }) {
  const pane = useOptionalChatPane();
  const [showSource, setShowSource] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const title = visual.title ?? "図";
  // 閉じた枠に描く種類（Mermaid はアプリの中で描く）
  const frameKind = visual.kind === "mermaid" ? null : visual.kind;
  const framed = frameKind !== null;
  // 中身が変わったら（描き直した）、前の中身の失敗は消す
  const shownError = error?.code === visual.code ? error.message : null;
  const onError = (message: string) => setError({ code: visual.code, message });
  // 利用者が図の中のボタンを押したときだけ届く。送り方はチャット欄の送信と同じ（作業中ならチャット欄の いま / あとで）
  const onPrompt = pane ? (text: string) => void pane.resend(text, []).catch(reportFailure("図から送れませんでした")) : undefined;
  const save = () => {
    if (!pane) return;
    saveVisualToMemo(visual, pane.chatId, pane.projectId()).catch((e: unknown) => setError({ code: visual.code, message: `メモに保存できませんでした: ${errorMessage(e)}` }));
  };
  return (
    <div className="visual-card" id={`ev-${eventId}`}>
      <div className="visual-card-head">
        <span className="visual-card-title">{title}</span>
        <span className="visual-card-kind">{VISUAL_KIND_LABELS[visual.kind]}</span>
        {visual.updatedBy.length > 0 && <span className="visual-card-note">描き直し {visual.updatedBy.length} 回</span>}
        <span className="visual-card-tools">
          {framed && <IconButton icon={showSource ? Eye : CodeXml} label={showSource ? "図を表示" : "ソースを表示"} size={14} onClick={() => setShowSource(!showSource)} />}
          <CopyButton text={visual.code} label="ソースをコピー" size={14} />
          {framed && !showSource && <IconButton icon={Maximize2} label="全画面で表示" size={14} onClick={() => setFullscreen(true)} />}
          {pane && <IconButton icon={StickyNote} label={visual.kind === "mermaid" ? "メモに保存（Markdown）" : "メモに保存（HTML。スクリプトは動きません）"} size={14} onClick={save} />}
        </span>
      </div>
      {frameKind === null ? (
        <MermaidDiagram code={visual.code} />
      ) : showSource ? (
        <pre className="visual-card-source">
          <code>
            <HighlightedCode code={visual.code} lang={SOURCE_LANG[visual.kind]} />
          </code>
        </pre>
      ) : (
        <VisualFrame
          kind={frameKind}
          code={visual.code}
          title={title}
          maxHeight={Math.round(window.innerHeight * MAX_HEIGHT_RATIO)}
          onError={onError}
          onPrompt={onPrompt}
        />
      )}
      {shownError && <div className="visual-card-error">{shownError}</div>}
      {fullscreen && frameKind !== null && (
        <ImageViewer name={title} onClose={() => setFullscreen(false)}>
          <div className="visual-fullscreen">
            <VisualFrame kind={frameKind} code={visual.code} title={title} fill onPrompt={onPrompt} />
          </div>
        </ImageViewer>
      )}
    </div>
  );
}
