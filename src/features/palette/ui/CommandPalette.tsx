import { Network, Search, SquarePen } from "lucide-react";
import { openPortsPopover, portsAvailable } from "@/features/ports/ui/portsStore";
import { busyWithUnread } from "@shared/chat/state";
import { useChatStates } from "@/features/chat/ui/state/chatStates";
import { StatusSlot } from "@/features/chat/ui/state/StatusSlot";
import { ProjectMark } from "@/features/projects/ui/ProjectMark";
import { PaletteChatChips, PaletteProjectMark } from "@/features/chatList/ui/PaletteChatParts";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/foundation/ui/api";
import { useChats } from "@/features/chat/ui/store/knownChats";
import { chatTitle } from "@/features/chat/ui/chatTitle";
import { cx } from "@/foundation/ui/lib/cx";
import { useListNavigation } from "@/foundation/ui/hooks/useListNavigation";
import { useModalDialog } from "@/foundation/ui/hooks/useModalDialog";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { useProjects } from "@/features/projects/ui/stores/projects";
import { navigate } from "@/foundation/ui/navigation/router";
import { storage } from "./storage";
import type { PaletteItem as Item } from "./paletteItem";
import { noteTextItem, messageItem, useDebouncedSearch } from "./textSearchItems";
import { usePaletteNotes } from "@/features/notes/ui/paletteSource";

/**
 * 探す対象。チャットの中の文言は全文検索（文言の全文検索のパネルと同じ API）で、入力したときだけ探す。ノートはすべてのプロジェクトのノートを名前（とフォルダ）で。
 * ノートの中の文言は、すべてのプロジェクトのノートの中の行を、入力したときだけ探す
 */
type Target = "project" | "chat" | "note" | "message" | "noteText";
const TARGETS: { value: Target; label: string }[] = [
  { value: "project", label: "プロジェクト" },
  { value: "chat", label: "チャット" },
  { value: "note", label: "ノート" },
  { value: "message", label: "チャット内の文言" },
  { value: "noteText", label: "ノート内の文言" },
];
const DEFAULT_TARGETS: Target[] = ["project", "chat", "note"];
const isTarget = (t: string): t is Target => TARGETS.some((x) => x.value === t);

/** ⌘K: プロジェクト・チャット・ノートを名前で（選べばチャット・ノートの中の文言でも）探して移動する */
export function CommandPalette({ onClose }: { onClose: () => void }) {
  const { projects, projectName } = useProjects();
  const [query, setQuery] = useState("");
  // すべてのプロジェクトのチャット（アーカイブしていないもの）
  const { chats } = useChats();
  // チャットの行の左は、サイドバーの行と同じ状態の印（作業中は回るリング・作業中のまま未読なら緑の点）
  const { stateOf } = useChatStates();
  const { ref: dialogRef, ...dialog } = useModalDialog();
  // 探す対象（複数選べる。開き直しても覚えておく。1 つは必ず残す）
  const [stored, setStored] = useSetting(storage.settings.targets);
  // 保存した値が変わったときだけ作り直す（下の一覧は、探す対象が変わったときだけ作り直す）
  const targets = useMemo(() => {
    const valid = stored.filter(isTarget);
    return valid.length > 0 ? valid : DEFAULT_TARGETS;
  }, [stored]);
  const targetKey = targets.join(",");
  const toggleTarget = (t: Target) => {
    const next = TARGETS.map((x) => x.value).filter((x) => (x === t ? !targets.includes(t) : targets.includes(x)));
    if (next.length > 0) setStored(next);
  };
  const messages = useDebouncedSearch(query, targets.includes("message"), (q) => api.search(q, {}));
  const noteTexts = useDebouncedSearch(query, targets.includes("noteText"), (q) => api.searchNotes(q).then((r) => r.hits));
  const searching = messages.searching || noteTexts.searching;
  const notes = usePaletteNotes(projects, targets.includes("note"), projectName);

  const items = useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase();
    const named: Item[] = [];
    if (targets.includes("project")) {
      // 新しいチャットはプロジェクトの操作なので、プロジェクトを探していて何か入力したときだけ
      if (q) {
        for (const p of projects) {
          const label = `${p.name} で新しいチャット`;
          named.push({ key: `new-${p.id}`, label, text: label, hint: "新規", icon: <SquarePen size={15} />, route: { name: "newChat", projectId: p.id } });
        }
      }
      for (const p of projects) {
        named.push({ key: `p-${p.id}`, label: p.name, text: p.name, hint: "プロジェクト", icon: <ProjectMark project={p} />, route: { name: "project", id: p.id, tab: "board" } });
      }
    }
    if (targets.includes("chat")) {
      for (const r of chats) {
        const title = chatTitle(r.title);
        named.push({ key: `r-${r.id}`, label: title, text: title, hint: projectName(r.project_id), hintMark: <PaletteProjectMark projectId={r.project_id} />, chips: <PaletteChatChips chat={r} />, icon: <StatusSlot state={stateOf(r)} unread={busyWithUnread(r, stateOf(r))} />, route: { name: "chat", projectId: r.project_id, chatId: r.id } });
      }
    }
    named.push(...notes);
    // 操作（何か入力したときだけ。下の帯を隠していても開ける。Mac のアプリの中だけ）
    if (q && portsAvailable()) {
      const label = "ポートを使っているプロセス";
      named.push({ key: "ports", label, text: `${label} port`, hint: "操作", icon: <Network size={15} />, run: openPortsPopover });
    }
    const filtered = q ? named.filter((i) => `${i.text} ${i.hint}`.toLowerCase().includes(q)) : named;
    // 名前で見つかったものを先に（50 件まで）、続けてチャットの中の文言・ノートの中の文言
    return [...filtered.slice(0, 50), ...messages.hits.map((h) => messageItem(h, projectName)), ...noteTexts.hits.map((h) => noteTextItem(h, projectName))];
  }, [projects, chats, notes, query, messages.hits, noteTexts.hits, targets, projectName, stateOf]);

  function go(item: Item | undefined) {
    if (!item) return;
    dialog.close();
    if (item.run) item.run();
    else if (item.route) navigate(item.route);
  }
  const nav = useListNavigation(items, go);
  useEffect(() => nav.setIndex(0), [query, targetKey]);

  const placeholder = `${TARGETS.filter((t) => targets.includes(t.value))
    .map((t) => t.label)
    .join("・")}を検索`;
  return (
    <dialog ref={dialogRef} className="palette" onClose={onClose} {...dialog.backdropProps}>
      <div className="palette-input">
        <Search size={16} className="muted" />
        <input autoFocus value={query} placeholder={placeholder} onChange={(e) => setQuery(e.target.value)} onKeyDown={nav.onKeyDown} />
        {searching && <span className="spinner" aria-label="検索中" />}
      </div>
      {/* 探す対象（複数選べる。押すたびに付け外し。⌘⇧A のプロジェクトの絞り込みと同じピル） */}
      <div className="palette-filters">
        <div className="palette-projects" role="group" aria-label="探す対象">
          {TARGETS.map((t) => {
            const on = targets.includes(t.value);
            return (
              <button
                key={t.value}
                type="button"
                aria-pressed={on}
                className={cx("palette-project", on && "active")}
                title={on ? (targets.length > 1 ? `${t.label}を探す対象から外す` : "探す対象は 1 つ以上選びます") : `${t.label}も探す`}
                onClick={() => toggleTarget(t.value)}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
      <ul className="palette-list" role="listbox">
        {items.length === 0 && !searching && <li className="palette-empty">見つかりません</li>}
        {items.map((item, i) => (
          <li key={item.key} role="option" aria-selected={i === nav.index}>
            <button className={cx("palette-item", i === nav.index && "active")} onMouseEnter={() => nav.setIndex(i)} onClick={() => go(item)}>
              {item.icon}
              <span className="palette-label">{item.label}</span>
              {item.chips}
              <span className="palette-hint">
                {item.hintMark}
                <span className="palette-hint-text">{item.hint}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </dialog>
  );
}
