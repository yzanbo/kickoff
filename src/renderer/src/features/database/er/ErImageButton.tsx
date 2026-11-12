import { useReactFlow } from "@xyflow/react";
import { ImageDown } from "lucide-react";
import { useRef } from "react";
import { safeMemoName } from "@shared/memo/names";
import { downloadBlob, downloadText } from "@/lib/download";
import { reportFailure } from "@/ui/dialogs";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import type { ErNode } from "./ErTableNode";
import { erSvg, type ErSvgBox, type ErSvgColors, type ErSvgLine } from "./erSvg";
import type { ErDiagramState } from "./useErDiagram";

/** PNG の倍率（Retina の画面で見てもにじまないよう 2 倍） */
const PNG_SCALE = 2;

/** 図の色をいまのテーマの CSS の変数から読む（ER 図の枠の要素で。--er-edge などは図の CSS が決める） */
function colorsOf(el: Element): ErSvgColors {
  const style = getComputedStyle(el);
  const v = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    background: v("--bg", "#ffffff"),
    box: v("--bg-elev", "#ffffff"),
    head: v("--bg-hover", "#f0f0f0"),
    border: v("--border-strong", "#cccccc"),
    text: v("--text", "#111111"),
    muted: v("--muted", "#777777"),
    edge: v("--er-edge", "#888888"),
    key: v("--warn", "#c08000"),
    // 本番の接続の図は環境の色の枠（画面の .db-er.db-env-production::after と同じ）
    frame: el.classList.contains("db-env-production") ? v("--db-env", "#d04040") : null,
  };
}

/** SVG の文を画像に描いて PNG にする */
async function svgToPng(svg: string, width: number, height: number, background: string): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(width * PNG_SCALE);
    canvas.height = Math.ceil(height * PNG_SCALE);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("画像を描けませんでした");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG にできませんでした"))), "image/png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * ER 図の「画像で保存 ▾」: 見えているテーブル（絞り込み・まわり・選んだものを当てたあと）を、いまの位置と表示の細かさのまま SVG / PNG で保存する。
 * 画面の HTML を写さず、箱の位置・大きさ（描いたあとに測ったもの）と関係から `erSvg` で描き直す。name は保存するファイルの名前（拡張子なし）
 */
export function ErImageButton({ er, name }: { er: ErDiagramState; name: string }) {
  const flow = useReactFlow<ErNode>();
  const menu = useContextMenu();
  const button = useRef<HTMLButtonElement>(null);

  const build = () => {
    const nodes = new Map(flow.getNodes().map((n) => [n.id, n]));
    const boxes: ErSvgBox[] = er.shown.flatMap((t) => {
      const n = nodes.get(t.name);
      if (!n) return [];
      const size = er.sizes.get(t.name);
      const fk = new Set(t.foreign_keys.flatMap((f) => f.columns));
      return [
        {
          name: t.name,
          view: t.kind === "view",
          x: n.position.x,
          y: n.position.y,
          width: n.measured?.width ?? size?.width ?? 200,
          height: n.measured?.height ?? size?.height ?? 60,
          columns: n.data.columns.map((c) => ({ name: c.name, type: c.type, primaryKey: c.primary_key, foreignKey: fk.has(c.name), nullable: c.nullable })),
        },
      ];
    });
    const colsShown = er.detail !== "names";
    const lines: ErSvgLine[] = er.shownRelations.map((r) => ({
      from: r.from,
      to: r.to,
      fromColumn: colsShown ? (r.fromColumns[0] ?? null) : null,
      toColumn: colsShown ? (r.toColumns[0] ?? null) : null,
      inferred: r.inferred,
      cardinality: r.cardinality,
    }));
    const colors = colorsOf(button.current?.closest(".db-er") ?? document.documentElement);
    return { ...erSvg(boxes, lines, colors), background: colors.background };
  };
  const file = safeMemoName(name);
  const saveSvg = () => downloadText(`${file}.svg`, build().svg, "image/svg+xml");
  const savePng = async () => {
    try {
      const { svg, width, height, background } = build();
      downloadBlob(`${file}.png`, await svgToPng(svg, width, height, background));
    } catch (e) {
      reportFailure("PNG で保存できませんでした")(e);
    }
  };

  return (
    <>
      <button ref={button} type="button" className="btn btn-sm" disabled={er.shown.length === 0} aria-haspopup="menu" onClick={(e) => menu.toggle(e, undefined)} data-tip="見えているテーブルを、いまの位置のまま画像で保存する">
        <ImageDown size={13} aria-hidden /> 画像で保存
      </button>
      {menu.menu && (
        <PopupMenu at={menu.menu.at} label="画像の形" onClose={menu.close}>
          <MenuItem onSelect={saveSvg}>SVG（拡大しても粗くならない）</MenuItem>
          <MenuItem onSelect={() => void savePng()}>PNG（2 倍の大きさ）</MenuItem>
        </PopupMenu>
      )}
    </>
  );
}
