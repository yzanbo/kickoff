// ER 図のタブ（@xyflow/react の図。DatabaseClient が lazy で読み、使わない間は読み込まない）
import "@xyflow/react/dist/style.css";
import { Background, ConnectionMode, Controls, MiniMap, ReactFlow, ReactFlowProvider, useNodesState, useReactFlow, type Edge, type NodeMouseHandler, type OnNodeDrag } from "@xyflow/react";
import { Network } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { DB_ER_AUTO_MAX, type DbConnection, type DbErPositions } from "@shared/types";
import { useAppliedTheme } from "@/hooks/useAppliedTheme";
import { cx } from "@/lib/cx";
import type { DbErTab } from "@/lib/dbClientTabs";
import { EmptyState } from "@/ui/EmptyState";
import { ErrorText } from "@/ui/ErrorText";
import { useDbClient } from "@/features/database/dbClientContext";
import { ErMarkers, edgeMarkers } from "./ErMarkers";
import { ErPicker } from "./ErPicker";
import { ErTableNode, type ErNode } from "./ErTableNode";
import { ErToolbar } from "./ErToolbar";
import { erColumnsOf } from "./erLayout";
import { useErDiagram, type ErTabPatch } from "./useErDiagram";

const NODE_TYPES = { erTable: ErTableNode };
/** 押してから開くまで待つ時間（ダブルクリックでまわりに絞るのと分ける） */
const CLICK_DELAY_MS = 250;

/**
 * ER 図のタブ: テーブルを箱、外部キー（と推測の関係の点線）を線で描く。押すとテーブルのタブ、ダブルクリックでそのテーブルのまわりに絞る。
 * 乗せるとつながったテーブルと線を強く、ほかを薄く。動かした位置は接続と場所ごとに覚える
 */
export default function ErView(props: { tab: DbErTab; connection: DbConnection; active: boolean; onChange: (patch: ErTabPatch) => void }) {
  return (
    <ReactFlowProvider>
      <ErCanvas {...props} />
    </ReactFlowProvider>
  );
}

function ErCanvas({ tab, connection, active, onChange }: { tab: DbErTab; connection: DbConnection; active: boolean; onChange: (patch: ErTabPatch) => void }) {
  const client = useDbClient();
  const er = useErDiagram(tab, connection, onChange);
  const theme = useAppliedTheme();
  const flow = useReactFlow();
  const [hovered, setHovered] = useState<string | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<ErNode>([]);
  const clickTimer = useRef<number | null>(null);

  /** 乗せたテーブルとつながったテーブル */
  const near = useMemo(() => {
    if (!hovered) return null;
    const set = new Set([hovered]);
    for (const r of er.shownRelations) {
      if (r.from === hovered) set.add(r.to);
      if (r.to === hovered) set.add(r.from);
    }
    return set;
  }, [hovered, er.shownRelations]);

  // 箱を作り直す（見せるテーブル・表示の細かさ・位置が変わったとき。動かしている間の位置は useNodesState が持つ）
  useEffect(() => {
    if (!er.ready) return;
    setNodes((prev) => {
      const old = new Map(prev.map((n) => [n.id, n]));
      return er.shown.map((t) => {
        const keys = er.keyColumns.get(t.name) ?? new Set<string>();
        const fk = new Set(t.foreign_keys.flatMap((f) => f.columns));
        const data = {
          table: t,
          columns: erColumnsOf(t, er.detail, keys),
          fkColumns: fk,
          keyColumns: keys,
          tone: near ? (t.name === hovered ? "focus" : near.has(t.name) ? "near" : "dim") : null,
          center: t.name === tab.focus,
        } as const;
        const before = old.get(t.name);
        const position = er.positionOf(t.name) ?? before?.position ?? { x: 0, y: 0 };
        return { ...(before ?? {}), id: t.name, type: "erTable" as const, position, data };
      });
    });
  }, [er.ready, er.shown, er.detail, er.keyColumns, er.positionOf, near, hovered, tab.focus, setNodes]);

  // 見せるものが変わったら全体を収める
  const shownKey = er.shown.map((t) => t.name).join("\n");
  useEffect(() => {
    if (!er.ready || !active) return;
    const id = window.setTimeout(() => void flow.fitView({ padding: 0.15, duration: 200 }), 30);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [er.ready, shownKey, active]);

  // 線（つなぐ左右は箱の位置で決める: 子が親より左なら子の右から親の左へ）
  const edges = useMemo<Edge[]>(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    return er.shownRelations.flatMap((r) => {
      const a = byId.get(r.from);
      const b = byId.get(r.to);
      if (!a || !b || r.from === r.to) return [];
      const center = (n: ErNode) => n.position.x + (n.measured?.width ?? er.sizes.get(n.id)?.width ?? 200) / 2;
      const rightward = center(a) <= center(b);
      const colsShown = er.detail !== "names";
      const fromCol = colsShown ? r.fromColumns[0] : "";
      const toCol = colsShown ? r.toColumns[0] : "";
      const lit = near ? near.has(r.from) && near.has(r.to) && (r.from === hovered || r.to === hovered) : false;
      const dim = near !== null && !lit;
      return [
        {
          id: r.id,
          source: r.from,
          target: r.to,
          sourceHandle: `${rightward ? "r" : "l"}:${fromCol}`,
          targetHandle: `${rightward ? "l" : "r"}:${toCol}`,
          type: "smoothstep",
          className: cx("db-er-edge", r.inferred && "inferred", lit && "lit", dim && "dim"),
          ...edgeMarkers(r.cardinality, lit),
          label: lit ? r.fromColumns.join(", ") + (r.inferred ? "（推測）" : "") : undefined,
          interactionWidth: 8,
          focusable: false,
        },
      ];
    });
  }, [nodes, er.shownRelations, er.detail, er.sizes, near, hovered]);

  const onNodeClick: NodeMouseHandler<ErNode> = (_e, node) => {
    if (clickTimer.current !== null) window.clearTimeout(clickTimer.current);
    clickTimer.current = window.setTimeout(() => {
      clickTimer.current = null;
      client.openTable(connection, tab.path, node.id, node.data.table.kind);
    }, CLICK_DELAY_MS);
  };
  const onNodeDoubleClick: NodeMouseHandler<ErNode> = (_e, node) => {
    if (clickTimer.current !== null) window.clearTimeout(clickTimer.current);
    clickTimer.current = null;
    onChange({ focus: node.id });
  };
  const onNodeDragStop: OnNodeDrag<ErNode> = (_e, _node, moved) => {
    const positions: DbErPositions = {};
    for (const n of nodes) positions[n.id] = { x: Math.round(n.position.x), y: Math.round(n.position.y) };
    for (const n of moved) positions[n.id] = { x: Math.round(n.position.x), y: Math.round(n.position.y) };
    er.savePositions(positions);
  };

  const schema = er.schema;
  return (
    <div className={cx("db-er", `db-env-${connection.environment}`)}>
      <ErToolbar tab={tab} connection={connection} er={er} onChange={onChange} />
      <ErrorText message={er.error ?? undefined} />
      {er.loading && !schema && <p className="db-er-loading small muted">構造を読み込み中…</p>}
      {schema && er.tooMany && !tab.focus && (
        <div className="db-er-choose">
          <p className="small">
            テーブル・ビューが {schema.names.length.toLocaleString()} 個あります（{DB_ER_AUTO_MAX} 個を超える DB は、初めは全体を描きません）。描くテーブルを選んでください。
          </p>
          <ErPicker names={schema.names} initial={[]} onPick={(names) => onChange({ names })} onAll={null} />
        </div>
      )}
      {schema && !er.tooMany && er.tables.length === 0 && (
        <EmptyState icon={Network} title="テーブルがありません">この場所にはテーブル・ビューがありません。木の右クリックで別の DB・スキーマの ER 図を開けます。</EmptyState>
      )}
      {schema && er.tables.length > 0 && (
        <div className="db-er-canvas">
          <ErMarkers />
          <ReactFlow<ErNode, Edge>
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            onNodesChange={onNodesChange}
            onNodeClick={onNodeClick}
            onNodeDoubleClick={onNodeDoubleClick}
            onNodeDragStop={onNodeDragStop}
            onNodeMouseEnter={(_e, n) => setHovered(n.id)}
            onNodeMouseLeave={() => setHovered(null)}
            connectionMode={ConnectionMode.Loose}
            nodesConnectable={false}
            edgesFocusable={false}
            elementsSelectable={false}
            zoomOnDoubleClick={false}
            onlyRenderVisibleElements
            minZoom={0.1}
            maxZoom={2}
            colorMode={theme}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={20} size={1} />
            <Controls showInteractive={false} position="bottom-left" />
            <MiniMap pannable zoomable position="bottom-right" className="db-er-minimap" style={{ width: 140, height: 90 }} />
          </ReactFlow>
          {er.shown.length === 0 && <p className="db-er-none small muted">絞り込みに当てはまるテーブルがありません。</p>}
        </div>
      )}
    </div>
  );
}
