import { Search } from "lucide-react";
import { useEffect, useLayoutEffect, useState } from "react";
import { useDebouncedSearch } from "@/foundation/ui/hooks/useDebouncedSearch";
import { paletteCommands, runCommand } from "@/foundation/ui/commands";
import { PaletteDialog, usePaletteDialog } from "@/foundation/ui/kit/floating/PaletteDialog";
import { PillGroup } from "@/foundation/ui/kit/PillGroup";
import { useRovingList } from "@/foundation/ui/kit/list/useRovingList";
import { cx } from "@/foundation/ui/lib/cx";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { navigate } from "@/foundation/ui/navigation/router";
import { storage } from "./storage";
import type { PaletteItem as Item } from "./paletteItem";
import { arrangePaletteItems, paletteSources, useNamedSourceItems, type PaletteNamedSource, type PaletteSource, type PaletteTextSource } from "./sources";

const isNamed = (s: PaletteSource): s is PaletteNamedSource => "useItems" in s;
const isText = (s: PaletteSource): s is PaletteTextSource => "search" in s;

/** ⌘K: 持ち主の機能が出した探す対象（paletteSources）を名前で（選べば中身の文でも）探して移動する */
export function CommandPalette({ onClose }: { onClose: () => void }) {
  const sources = paletteSources.items();
  const [query, setQuery] = useState("");
  const modal = usePaletteDialog();
  // 探す対象（複数選べる。開き直しても覚えておく。1 つは必ず残す）
  const [stored, setStored] = useSetting(storage.settings.targets);
  const valid = sources.filter((s) => stored.includes(s.id)).map((s) => s.id);
  const targets = valid.length > 0 ? valid : sources.filter((s) => s.byDefault).map((s) => s.id);
  const targetKey = targets.join(",");
  // 名前で探す対象の行（対象ごとの hook が NamedRows の中で読み、ここへ渡す）
  const [namedBy, setNamedBy] = useState<Record<string, readonly Item[]>>({});
  const report = (id: string, items: readonly Item[]) => setNamedBy((prev) => (prev[id] === items ? prev : { ...prev, [id]: items }));
  // 中身の文で探す対象（入力が止まってから、選んだ対象をまとめて探す。選んでいなければ探さない）
  const textSources = sources.filter(isText).filter((s) => targets.includes(s.id));
  const texts = useDebouncedSearch(textSources.length > 0 ? query : "", (q) => Promise.all(textSources.map((s) => s.search(q).catch(() => []))).then((r) => r.flat()), 200, targetKey);

  const q = query.trim();
  const named = sources.filter(isNamed).flatMap((s) => namedBy[s.id] ?? []);
  // 操作（何か入力したときだけ。コマンドの表の group を持つもの）
  const actions: Item[] = q
    ? paletteCommands().map((c) => {
        const Icon = c.icon;
        return { key: `cmd-${c.id}`, label: c.title, text: c.keywords ? `${c.title} ${c.keywords}` : c.title, hint: c.group ?? "", icon: Icon ? <Icon size={15} /> : null, run: () => void runCommand(c.id) };
      })
    : [];
  const items = arrangePaletteItems([...named, ...actions], texts.results, query);

  function go(item: Item | undefined) {
    if (!item) return;
    modal.close();
    if (item.run) item.run();
    else if (item.route) navigate(item.route);
  }
  const nav = useRovingList({ mode: "activeDescendant", keys: items, onPick: go });
  useEffect(() => nav.setIndex(0), [query, targetKey]);

  const placeholder = `${sources
    .filter((s) => targets.includes(s.id))
    .map((s) => s.label)
    .join("・")}を検索`;
  return (
    <PaletteDialog
      modal={modal}
      nav={nav}
      icon={<Search size={16} className="muted" />}
      input={{ value: query, onChange: setQuery, placeholder }}
      inputAfter={texts.loading && <span className="spinner" aria-label="検索中" />}
      onClose={onClose}
      bars={
        // 探す対象（複数選べる。押すたびに付け外し。⌘⇧A のプロジェクトの絞り込みと同じピル）
        <div className="palette-filters bar">
          <PillGroup
            className="palette-projects"
            pillClassName="palette-project pill"
            label="探す対象"
            mode="multi"
            keepOne
            selected={targets}
            pills={sources.map((s) => {
              const on = targets.includes(s.id);
              return { key: s.id, label: s.label, title: on ? (targets.length > 1 ? `${s.label}を探す対象から外す` : "探す対象は 1 つ以上選びます") : `${s.label}も探す` };
            })}
            onChange={(next) => setStored(sources.map((s) => s.id).filter((id) => next.includes(id)))}
          />
        </div>
      }
    >
      {sources.filter(isNamed).map((s) => (
        <NamedRows key={s.id} id={s.id} enabled={targets.includes(s.id)} query={query} onItems={report} />
      ))}
      {items.length === 0 && !texts.loading && <li className="palette-empty">見つかりません</li>}
      {items.map((item, i) => (
        <li key={item.key} role="option" {...nav.optionProps(i)}>
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
    </PaletteDialog>
  );
}

/** 名前で探す対象 1 つの行を読み、描く前に ⌘K へ渡す（何も描かない。hook は対象ごとに 1 つ） */
function NamedRows({ id, enabled, query, onItems }: { id: string; enabled: boolean; query: string; onItems: (id: string, items: readonly Item[]) => void }) {
  const items = useNamedSourceItems(id, enabled, query);
  useLayoutEffect(() => onItems(id, items), [id, items, onItems]);
  return null;
}
