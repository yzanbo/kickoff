import { lazy, Suspense } from "react";
import type { DbConnection } from "@shared/database/types";
import type { ReactNode } from "react";
import type { Tabs } from "@/foundation/ui/kit/tabs/useTabs";
import { renameNoteTab, setTableFilter, updateErTab, type DbClientTab, type DbClientTabs } from "@/features/database/ui/dbClientTabs";
import { SqlView } from "@/features/database/ui/sql/SqlView";
import { DefinitionView } from "@/features/database/ui/table/DefinitionView";
import { TableView } from "@/features/database/ui/table/TableView";

/** ER 図（@xyflow/react と elkjs は ER 図を開いたときだけ読む） */
const ErView = lazy(() => import("@/features/database/ui/er/ErView"));

/** 手順ノートのタブの中身（名前を変えたら onRenamed） */
type NoteView = (path: string, onRenamed: (to: string) => void) => ReactNode;

/** タブの中身（種類ごと）。タブの並びの書き換えは update（いまの値から） */
function DbTabPage({ tab: t, connection: c, active, update, note }: { tab: DbClientTab; connection: DbConnection; active: boolean; update: (fn: (s: DbClientTabs) => DbClientTabs) => void; note: NoteView }) {
  // 接続の note_path はコアが付け替えて知らせる
  if (t.kind === "note") return note(t.path, (to) => update((s) => renameNoteTab(s, t.key, to)));
  if (t.kind === "sql") return <SqlView tab={t} connection={c} active={active} />;
  if (t.kind === "er") {
    return (
      <Suspense fallback={<p className="db-er-loading small muted">読み込み中…</p>}>
        <ErView tab={t} connection={c} active={active} onChange={(patch) => update((s) => updateErTab(s, t.key, patch))} />
      </Suspense>
    );
  }
  if (t.object === "function" || t.object === "enum") return <DefinitionView tab={{ ...t, object: t.object }} connection={c} />;
  return <TableView tab={t} connection={c} active={active} onFilter={(filter) => update((s) => setTableFilter(s, t.key, filter))} />;
}

/** タブの中身の並び（表示中のものだけ見せる。消した接続のタブは描かない） */
export function DbTabPages({ tabs, state, connectionOf, update, note }: { tabs: Tabs<string>; state: DbClientTabs; connectionOf: (id: number) => DbConnection | undefined; update: (fn: (s: DbClientTabs) => DbClientTabs) => void; note: NoteView }) {
  return state.tabs.map((t) => {
    const c = connectionOf(t.connection_id);
    return (
      c && (
        <div key={t.key} className="db-tab-page" {...tabs.panelProps(t.key)}>
          <DbTabPage tab={t} connection={c} active={t.key === state.active} update={update} note={note} />
        </div>
      )
    );
  });
}
