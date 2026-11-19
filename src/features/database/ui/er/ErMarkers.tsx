import type { ErCardinality } from "@shared/database/erDiagram";

/** 線の端の印（カラスの足の記法）: ||（必ず 1）・|o（0 か 1）・o{（0 以上の多）。強く見せる線は -lit の色違い */
const MARKS = ["er-one", "er-zero-one", "er-zero-many"] as const;
type Mark = (typeof MARKS)[number];

/** 印の形（右端 x=24 が箱の側。始まりの端は auto-start-reverse で向きを返す） */
function MarkShape({ mark }: { mark: Mark }) {
  switch (mark) {
    case "er-one":
      return <path d="M14 3 V13 M18 3 V13" />;
    case "er-zero-one":
      return (
        <>
          <path d="M18 3 V13" />
          <circle cx="9" cy="8" r="3.5" />
        </>
      );
    case "er-zero-many":
      return (
        <>
          <path d="M13 8 L24 2.5 M13 8 L24 13.5 M13 8 H24" />
          <circle cx="7" cy="8" r="3.5" />
        </>
      );
  }
}

/** 図の線が使う印の定義（ReactFlow の線は id で指す。図ごとに置く。ほかの ER 図のタブと同じ id でも中身が同じなので構わない） */
export function ErMarkers() {
  return (
    <svg className="db-er-markers" width="0" height="0" aria-hidden>
      <defs>
        {MARKS.flatMap((mark) =>
          [false, true].map((lit) => (
            <marker
              key={`${mark}${lit ? "-lit" : ""}`}
              id={`${mark}${lit ? "-lit" : ""}`}
              viewBox="0 0 24 16"
              refX="24"
              refY="8"
              markerWidth="24"
              markerHeight="16"
              markerUnits="userSpaceOnUse"
              orient="auto-start-reverse"
              className={lit ? "db-er-mark lit" : "db-er-mark"}
            >
              <MarkShape mark={mark} />
            </marker>
          )),
        )}
      </defs>
    </svg>
  );
}

/** 線の両端の印（始まり = 外部キーを持つ子の側、終わり = 指される親の側） */
export function edgeMarkers(c: ErCardinality, lit: boolean): { markerStart: string; markerEnd: string } {
  const suffix = lit ? "-lit" : "";
  return {
    markerStart: `${c.child === "one" ? "er-zero-one" : "er-zero-many"}${suffix}`,
    markerEnd: `${c.parent === "required" ? "er-one" : "er-zero-one"}${suffix}`,
  };
}
