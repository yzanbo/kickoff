import { Clipboard, FileText, LayoutGrid, ListChecks, X } from "lucide-react";
import { useRef, useState } from "react";
import { DB_ER_AUTO_MAX, type DbConnection } from "@shared/database/types";
import { erMermaid, erPlace } from "@shared/database/erDiagram";
import { safeNoteName, uniqueNoteName } from "@shared/notes/names";
import { api } from "@/foundation/ui/api";
import { open } from "@/foundation/ui/navigation/open";
import type { DbErTab } from "@/features/database/ui/client/dbClientTabs";
import { confirm, reportFailure } from "@/foundation/ui/kit/ask";
import { RefreshButton } from "@/foundation/ui/kit/IconButton";
import { Popover } from "@/foundation/ui/kit/Popover";
import { SearchField } from "@/foundation/ui/kit/SearchField";
import { Segmented } from "@/foundation/ui/kit/Segmented";
import { AskAiButton } from "@/features/database/ui/DbAiButtons";
import { useDbClient } from "@/features/database/ui/dbClientContext";
import { ErImageButton } from "./ErImageButton";
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
 * 自動で並べ直す・Mermaid でコピー・ノートに書き出す・画像で保存（SVG / PNG）・見えているテーブルについてチャットで聞く・読み直す
 */
export function ErToolbar({ tab, connection, er, onChange }: { tab: DbErTab; connection: DbConnection; er: ErDiagramState; onChange: (patch: ErTabPatch) => void }) {
  const client = useDbClient();
  const pickAnchor = useRef<HTMLButtonElement>(null);
  const [picking, setPicking] = useState(false);
  const [copied, setCopied] = useState(false);
  const names = er.schema?.names ?? [];

  // 書き出すノート・画像の名前
  const title = `ER 図 ${connection.name} ${erPlace(tab.path)}${tab.focus ? ` ${tab.focus}` : ""}`;
  const mermaid = () => erMermaid(er.shown, er.shownRelations, er.detail);
  const copy = async () => {
    await navigator.clipboard.writeText(mermaid());
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  /** 見えているものを Mermaid の文にしてノートに書き出す（失敗は投げる） */
  const writeNote = async () => {
    const list = await api.notes(client.projectId);
    const taken = list.entries.filter((e) => !e.dir && !e.path.includes("/")).map((e) => e.path.replace(/\.md$/i, ""));
    const name = uniqueNoteName(safeNoteName(title), taken);
    const where = [connection.name, tab.path.database, tab.path.schema].filter(Boolean).join(" / ");
    const content = `# ER 図: ${where}${tab.focus ? `（${tab.focus} のまわり）` : ""}\n\n\`\`\`mermaid\n${mermaid()}\n\`\`\`\n`;
    const path = `${name}.md`;
    await api.createNote(client.projectId, path, { content });
    if (await confirm({ title: "ノートに書き出しました", message: `ノート「${path}」に Mermaid の ER 図を書き出しました。ノートのタブで開きますか？`, confirmLabel: "開く" })) {
      open({ kind: "note", projectId: client.projectId, path: path });
    }
  };
  const exportNote = () => writeNote().catch((e: unknown) => void reportFailure("ノートに書き出せませんでした")(e));

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
      <button type="button" className="btn btn-sm" disabled={er.shown.length === 0} onClick={() => void exportNote()} data-tip="見えているテーブルを Mermaid の図にして、このプロジェクトのノートに書き出す">
        <FileText size={13} aria-hidden /> ノートに書き出す
      </button>
      <ErImageButton er={er} name={title} />
      <AskAiButton connection={connection} path={tab.path} tables={er.shown.map((t) => t.name)} label="チャットで聞く" />
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
