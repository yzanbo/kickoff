import { Code, Eye, Maximize2, SquareDashed, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useAppliedTheme } from "@/app/theme";
import { IconButton } from "@/ui/IconButton";
import { ImageViewer } from "@/ui/imageViewer/ImageViewer";
import { cachedMermaid, renderMermaid } from "./renderMermaid";

/** チャットの中: 欄の幅に収める（元の大きさより大きくはしない） */
const FIT_CSS = ":host > svg { display: block; max-width: 100%; height: auto; margin-inline: auto; }";
/** 拡大・縮小したとき・全画面: 決めた幅で描く（高さは縦横比のまま。枠より大きければスクロール） */
const SIZED_CSS = ":host > svg { display: block; width: var(--diagram-w); max-width: none !important; height: auto; margin-inline: auto; }";
/** 全画面の枠の外側の余白（ダイアログの余白・見出し・枠の内側の余白） */
const FULLSCREEN_MARGIN = { x: 96, y: 160 };
/** 拡大・縮小の 1 回の倍率と、枠に合わせた大きさからの上限・下限 */
const ZOOM_STEP = 1.25;
const ZOOM_LIMIT = 4;

/** 図の元の大きさ（viewBox から） */
function naturalSize(svg: string): { width: number; height: number } {
  const m = /viewBox="[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(svg);
  return m ? { width: Number(m[1]), height: Number(m[2]) } : { width: 800, height: 600 };
}

/** 全画面での図の幅。画面に収まる大きさまで広げ（元の 2 倍まで）、元の大きさでも収まらない図は元の大きさのままにする */
function fullscreenWidth(svg: string): number {
  const { width, height } = naturalSize(svg);
  const fit = Math.min((window.innerWidth - FULLSCREEN_MARGIN.x) / width, (window.innerHeight - FULLSCREEN_MARGIN.y) / height);
  return Math.round(width * Math.min(2, Math.max(1, fit)));
}

/** 図の拡大・縮小。width が undefined の間は、枠に合わせた大きさ（fitWidth）で出す */
function useDiagramZoom(fitWidth: () => number) {
  const [width, setWidth] = useState<number>();
  const scaleBy = (factor: number) => {
    const fit = fitWidth();
    setWidth((w) => Math.round(Math.min(fit * ZOOM_LIMIT, Math.max(fit / ZOOM_LIMIT, (w ?? fit) * factor))));
  };
  return { width, zoomIn: () => scaleBy(ZOOM_STEP), zoomOut: () => scaleBy(1 / ZOOM_STEP), reset: () => setWidth(undefined) };
}
type DiagramZoom = ReturnType<typeof useDiagramZoom>;

/** 拡大・縮小・元の大きさに戻すボタン */
function ZoomButtons({ zoom }: { zoom: DiagramZoom }) {
  return (
    <>
      <IconButton icon={ZoomIn} label="拡大" size={14} onClick={zoom.zoomIn} />
      <IconButton icon={ZoomOut} label="縮小" size={14} onClick={zoom.zoomOut} />
      <IconButton icon={SquareDashed} label="元の大きさに戻す" size={14} disabled={zoom.width === undefined} onClick={zoom.reset} />
    </>
  );
}

/**
 * Markdown の ```mermaid を図にする。
 * 図はチャットの中に SVG で入れ、Shadow DOM で囲む。描けないとき（書き方の誤り・大きすぎる図）はコードのまま出す
 */
export function MermaidDiagram({ code }: { code: string }) {
  const theme = useAppliedTheme();
  const key = `${theme}\n${code}`;
  const [result, setResult] = useState<{ key: string; svg?: string; failed?: boolean }>();
  const [showSource, setShowSource] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const cached = cachedMermaid(code, theme);
  const boxRef = useRef<HTMLDivElement>(null);
  // 枠に合わせた幅（欄の幅か、元の幅の小さいほう）を基準に、拡大・縮小する
  const zoom = useDiagramZoom(() => {
    const box = boxRef.current;
    const inner = box ? box.clientWidth - parseFloat(getComputedStyle(box).paddingLeft) * 2 : 600;
    return Math.min(inner, naturalSize(svg ?? "").width);
  });

  useEffect(() => {
    if (cachedMermaid(code, theme) !== undefined) return;
    let alive = true;
    renderMermaid(code, theme).then(
      (svg) => alive && setResult({ key: `${theme}\n${code}`, svg }),
      () => alive && setResult({ key: `${theme}\n${code}`, failed: true }),
    );
    return () => {
      alive = false;
    };
  }, [code, theme]);

  // 配色を変えた直後は、描き終わるまで前の図を出しておく（ちらつかないように）
  const svg = cached ?? result?.svg;
  if (!cached && result?.key === key && result.failed) {
    return (
      <pre>
        <code className="language-mermaid">{code}</code>
      </pre>
    );
  }
  if (svg === undefined) return <MermaidPlaceholder />;
  return (
    <div ref={boxRef} className="mermaid-diagram">
      {/* 図の上の行に右寄せで並べる（拡大・縮小・元の大きさ・ソース・全画面） */}
      <div className="mermaid-tools">
        {!showSource && <ZoomButtons zoom={zoom} />}
        <IconButton icon={showSource ? Eye : Code} label={showSource ? "図を表示" : "ソースを表示"} size={14} onClick={() => setShowSource(!showSource)} />
        {!showSource && <IconButton icon={Maximize2} label="全画面で表示" size={14} onClick={() => setFullscreen(true)} />}
      </div>
      {showSource ? (
        <pre className="mermaid-source">
          <code className="language-mermaid">{code}</code>
        </pre>
      ) : zoom.width === undefined ? (
        <SvgHost svg={svg} css={FIT_CSS} />
      ) : (
        <SvgHost svg={svg} css={SIZED_CSS} width={zoom.width} />
      )}
      {fullscreen && <FullscreenDiagram svg={svg} onClose={() => setFullscreen(false)} />}
    </div>
  );
}

/** 図を全画面で見る（画面に収まる大きさで開き、拡大・縮小できる） */
function FullscreenDiagram({ svg, onClose }: { svg: string; onClose: () => void }) {
  const zoom = useDiagramZoom(() => fullscreenWidth(svg));
  return (
    <ImageViewer
      name="Mermaid の図"
      onClose={onClose}
      actions={
        <span className="image-viewer-tools">
          <ZoomButtons zoom={zoom} />
        </span>
      }
    >
      <div className="mermaid-fullscreen">
        <SvgHost svg={svg} css={SIZED_CSS} width={zoom.width ?? fullscreenWidth(svg)} />
      </div>
    </ImageViewer>
  );
}

/** 返答の生成中・図を描いている間に出す枠（書き終わってから図にする） */
export function MermaidPlaceholder() {
  return <div className="mermaid-diagram mermaid-placeholder" role="img" aria-label="Mermaid の図（準備中）" aria-busy="true" />;
}

/**
 * SVG を Shadow DOM の中に入れて出す（図の CSS がアプリに漏れず、アプリの CSS も図に効かない）。
 * width: SIZED_CSS で描くときの幅（px）
 */
function SvgHost({ svg, css, width }: { svg: string; css: string; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const host = ref.current;
    if (!host) return;
    const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${css}</style>${svg}`;
  }, [svg, css]);
  const style = width === undefined ? undefined : ({ "--diagram-w": `${width}px` } as CSSProperties);
  return <div ref={ref} className="mermaid-svg" role="img" aria-label="Mermaid の図" style={style} />;
}
