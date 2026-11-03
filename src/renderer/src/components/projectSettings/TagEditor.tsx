import { Plus, Tag } from "lucide-react";
import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { collectTags, MAX_TAG_LENGTH, MAX_TAGS, normalizeTags } from "../../../../core/projectTags";
import type { Project } from "../../../../core/types";
import { api } from "../../api";
import { cx } from "../../cx";
import { errorMessage } from "../../errors";
import { useListNavigation } from "../../hooks/useListNavigation";
import { useProjects } from "../../projectsContext";
import { ErrorText } from "../ErrorText";
import { Field } from "../Field";
import { ProjectTags } from "../ProjectTags";

/** タグを区切る文字（読点・カンマ。全角のカンマも） */
const SEPARATORS = /[、,，]/;

/** 候補の 1 行（isNew: 入力中の文をそのまま新しいタグにする） */
interface Candidate {
  value: string;
  isNew: boolean;
}

/**
 * プロジェクトの編集の「基本情報」の「タグ」の欄。付いているタグをチップで並べ（× で外す）、入力欄で Enter・読点・カンマで足す。
 * 入力中・↓ で、ほかのプロジェクトで使っているタグを候補に出す（↑↓・Enter。Esc で閉じる）。足す・外すと、すぐ保存する。
 * 入力欄を先に置く（Field は label なので、名前を押したときに最初のチップの × が押されないように）
 */
export function TagEditor({ project }: { project: Project }) {
  const { projects } = useProjects();
  // 続けて足しても前の分を失わないよう、手元で持つ（保存した結果が届いたら追従する）
  const [tags, setTags] = useState(project.tags);
  useEffect(() => setTags(project.tags), [project.tags]);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();

  const save = (next: string[]) => {
    setError(undefined);
    setTags(next);
    api.updateProject(project.id, { tags: next }).catch((e: unknown) => {
      setError(errorMessage(e));
      setTags(project.tags);
    });
  };

  /** 文（読点・カンマで区切って複数も）をタグとして足す。上限を超えるなら足さずに知らせる */
  const add = (raw: string) => {
    const parts = normalizeTags(raw.split(SEPARATORS));
    if (parts.length === 0) return;
    const tooLong = parts.find((t) => t.length > MAX_TAG_LENGTH);
    if (tooLong) return setError(`タグは ${MAX_TAG_LENGTH} 文字までです（「${tooLong.slice(0, 10)}…」）`);
    const next = normalizeTags([...tags, ...parts]);
    if (next.length > MAX_TAGS) return setError(`タグは ${MAX_TAGS} 個までです`);
    setText("");
    setOpen(false);
    if (next.length !== tags.length) save(next);
  };

  // 候補: 入力中の文（新しいタグ）を先頭に、ほかのプロジェクトで使っているタグのうち、付けていなくて文を含むもの
  const query = text.trim();
  const items = useMemo<Candidate[]>(() => {
    if (!open) return [];
    const q = query.toLowerCase();
    const known = collectTags(projects).filter((t) => !tags.includes(t) && t.toLowerCase().includes(q));
    const isNew = query !== "" && !known.includes(query) && !tags.includes(query);
    return [...(isNew ? [{ value: query, isNew: true }] : []), ...known.map((value) => ({ value, isNew: false }))];
  }, [open, query, projects, tags]);
  const nav = useListNavigation(items, (item) => (item ? add(item.value) : add(text)));
  useEffect(() => nav.setIndex(0), [query, open]);

  const onChange = (value: string) => {
    // 読点・カンマを打ったら、その前までをタグにする
    if (SEPARATORS.test(value)) {
      const parts = value.split(SEPARATORS);
      const rest = parts.pop() ?? "";
      add(parts.join(","));
      setText(rest);
      return;
    }
    setText(value);
    setOpen(value.trim() !== "");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape" && open) {
      // 候補だけを閉じる（ダイアログは閉じない）
      e.preventDefault();
      e.stopPropagation();
      return setOpen(false);
    }
    if (e.key === "ArrowDown" && !open) {
      e.preventDefault();
      return setOpen(true);
    }
    if (e.key === "Enter" && !e.nativeEvent.isComposing && items.length === 0) {
      e.preventDefault();
      if (query) add(query);
      return;
    }
    nav.onKeyDown(e);
  };

  return (
    <Field
      label="タグ"
      help={`仕事・プライベートなど。Enter・読点・カンマで足し、× で外します（${MAX_TAG_LENGTH} 文字・${MAX_TAGS} 個まで）。↓ でほかのプロジェクトのタグから選べます。サイドバーの見出しの「タグ」で絞り込めます。`}
    >
      <div className="tag-editor">
        <div className="tag-editor-input">
          <input
            type="text"
            value={text}
            placeholder={tags.length >= MAX_TAGS ? `タグは ${MAX_TAGS} 個までです` : "タグを入力して Enter"}
            disabled={tags.length >= MAX_TAGS}
            role="combobox"
            aria-expanded={items.length > 0}
            aria-autocomplete="list"
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={() => setOpen(false)}
          />
          {items.length > 0 && (
            <div className="tag-suggest" role="listbox" aria-label="タグの候補">
              {items.map((item, i) => (
                <button
                  key={`${item.isNew}:${item.value}`}
                  type="button"
                  role="option"
                  aria-selected={i === nav.index}
                  className={cx("tag-suggest-item", i === nav.index && "active")}
                  // 押しても入力欄からピントを外さない（外すと候補が閉じる）
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => nav.setIndex(i)}
                  onClick={() => add(item.value)}
                >
                  {item.isNew ? <Plus size={13} aria-hidden /> : <Tag size={13} aria-hidden />}
                  <span className="tag-suggest-name">{item.isNew ? `新しいタグ「${item.value}」` : item.value}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <ProjectTags tags={tags} onRemove={(tag) => save(tags.filter((t) => t !== tag))} />
        <ErrorText message={error} />
      </div>
    </Field>
  );
}
