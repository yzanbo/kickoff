import { Clipboard, FileText, LayoutGrid, ListChecks, X } from "lucide-react";
import { useRef, useState } from "react";
import { DB_ER_AUTO_MAX, type DbConnection } from "@shared/types";
import { erMermaid, erPlace } from "@shared/database/erDiagram";
import { safeMemoName, uniqueMemoName } from "@shared/memo/names";
import { api } from "@/api";
import { openMemo } from "@/app/router";
import type { DbErTab } from "@/lib/dbClientTabs";
import { confirmDialog, reportFailure } from "@/ui/dialogs";
import { RefreshButton } from "@/ui/IconButton";
import { Popover } from "@/ui/Popover";
import { SearchField } from "@/ui/SearchField";
import { Segmented } from "@/ui/Segmented";
import { useDbClient } from "@/features/database/dbClientContext";
import { ErPicker } from "./ErPicker";
import type { ErDetail } from "./erLayout";
import { ER_ALL_DEPTH, type ErDiagramState, type ErTabPatch } from "./useErDiagram";

const DETAILS: { value: ErDetail; label: string }[] = [
  { value: "all", label: "すべての列" },
  { value: "keys", label: "キーだけ" },
  { value: "names", label: "名前だけ" },
];
const DEPTHS = [
  { value: "1", label: "1 段" },
  { value: "2", label: "2 段" },
  { value: "3", label: "3 段" },
  { value: String(ER_ALL_DEPTH), label: "すべて" },
];

/**
 * ER 図の道具の行: 名前の絞り込み・まわりの段（中心のテーブルがあるとき）・表示の細かさ・推測の関係・テーブルを選ぶ・
 * 自動で並べ直す・Mermaid でコピー・メモに書き出す・読み直す
 */
export function ErToolbar({ tab, connection, er, onChange }: { tab: DbErTab; connection: DbConnection; er: ErDiagramState; onChange: (patch: ErTabPatch) => void }) {
  const client = useDbClient();
  const pickAnchor = useRef<HTMLButtonElement>(null);
  const [picking, setPicking] = useState(false);
  const [copied, setCopied] = useState(false);
  const names = er.schema?.names ?? [];

  const mermaid = () => erMermaid(er.shown, er.shownRelations, er.detail);
  const copy = async () => {
    await navigator.clipboard.writeText(mermaid());
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  const exportMemo = async () => {
    try {
      const list = await api.memos(client.projectId);
      const taken = list.entries.filter((e) => !e.dir && !e.path.includes("/")).map((e) => e.path.replace(/\.md$/i, ""));
      const name = uniqueMemoName(safeMemoName(`ER 図 ${connection.name} ${erPlace(tab.path)}${tab.focus ? ` ${tab.focus}` : ""}`), taken);
      const where = [connection.name, tab.path.database, tab.path.schema].filter(Boolean).join(" / ");
      const content = `# ER 図: ${where}${tab.focus ? `（${tab.focus} のまわり）` : ""}\n\n\`\`\`mermaid\n${mermaid()}\n\`\`\`\n`;
      const path = `${name}.md`;
      await api.createMemo(client.projectId, path, { content });
      if (await confirmDialog({ title: "メモに書き出しました", message: `メモ「${path}」に Mermaid の ER 図を書き出しました。メモのタブで開きますか？`, confirmLabel: "開く" })) {
        openMemo(client.projectId, path);
      }
    } catch (e) {
      reportFailure("メモに書き出せませんでした")(e);
    }
  };

  return (
    <div className="db-er-toolbar">
      <SearchField value={er.query} onChange={er.setQuery} placeholder="テーブルの名前" label="テーブルを名前で絞り込む" className="db-er-search" />
      {tab.focus && (
        <span className="db-er-focus">
          <span className="db-er-focus-name" title={`${tab.focus} のまわりだけ見ています`}>
            まわり: {tab.focus}
          </span>
          <Segmented value={String(tab.depth)} options={DEPTHS} onChange={(v) => onChange({ depth: Number(v) })} label="まわりの段の数" className="segmented db-er-segmented" />
          <button type="button" className="btn btn-sm" onClick={() => onChange({ focus: null })} data-tip="まわりの絞り込みをやめて全体を見る">
            <X size={12} aria-hidden /> 全体
          </button>
        </span>
      )}
      <Segmented value={er.detail} options={DETAILS} onChange={er.setDetail} label="表示の細かさ" className="segmented db-er-segmented" />
      <label className="db-er-check small" data-tip="外部キーの制約がなくても「<テーブル名の単数>_id」の列を、そのテーブルの id への関係として点線で描く">
        <input type="checkbox" checked={er.inferred} onChange={(e) => er.setInferred(e.target.checked)} /> 推測の関係
      </label>
      <span className="db-er-toolbar-gap" />
      <span className="db-er-count small muted">
        {er.shown.length.toLocaleString()} / {names.length.toLocaleString()} 個
      </span>
      {names.length > 0 && (
        <button ref={pickAnchor} type="button" className="btn btn-sm" aria-expanded={picking} onClick={() => setPicking((v) => !v)} data-tip="描くテーブルを選ぶ">
          <ListChecks size={13} aria-hidden /> テーブルを選ぶ
        </button>
      )}
      <button type="button" className="btn btn-sm" onClick={() => void er.relayout()} data-tip="動かした位置を忘れて、自動で並べ直す">
        <LayoutGrid size={13} aria-hidden /> 自動で並べ直す
      </button>
      <button type="button" className="btn btn-sm" disabled={er.shown.length === 0} onClick={() => void copy()} data-tip="見えているテーブルを Mermaid の erDiagram の文でコピー">
        <Clipboard size={13} aria-hidden /> {copied ? "コピーしました" : "Mermaid でコピー"}
      </button>
      <button type="button" className="btn btn-sm" disabled={er.shown.length === 0} onClick={() => void exportMemo()} data-tip="見えているテーブルを Mermaid の図にして、このプロジェクトのメモに書き出す">
        <FileText size={13} aria-hidden /> メモに書き出す
      </button>
      <RefreshButton label="構造を読み直す" busy={er.loading} onClick={er.reload} />
      {picking && (
        <Popover anchor={pickAnchor} align="end" label="描くテーブル" title="描くテーブル" className="db-er-pick-popover" onClose={() => setPicking(false)}>
          <ErPicker
            names={names}
            initial={er.tables.map((t) => t.name)}
            onPick={(picked) => {
              setPicking(false);
              onChange({ names: picked, focus: null });
            }}
            onAll={
              names.length <= DB_ER_AUTO_MAX
                ? () => {
                    setPicking(false);
                    onChange({ names: null, focus: null });
                  }
                : null
            }
          />
        </Popover>
      )}
    </div>
  );
}
