import { ChevronDown, ChevronRight, ChevronUp, Replace, ReplaceAll, Search } from "lucide-react";
import type { KeyboardEvent, PointerEvent, ReactNode, Ref } from "react";
import { cx } from "@/lib/cx";
import { isCancelKey, isComposing } from "@/lib/keys";
import type { FindOptionName, FindOptions } from "@/lib/textFind";
import { FindOptionButtons, handleFindOptionKey } from "./FindOptionButtons";
import { CloseButton, IconButton } from "./IconButton";

/**
 * 件数の文（どの検索の欄でも同じ形）: 正規表現の誤り = 「誤り」・文がない = 空・見つからない = 「0 件」・何番目か分かる = 「2/5」・
 * まだ移っていない = 「5 件」。数えるのを途中でやめた（多すぎる）なら後ろに「+」
 */
export function findCountText({ invalid, query, total, current, capped = false }: { invalid: boolean; query: string; total: number; current: number | null; capped?: boolean }): string {
  if (invalid) return "誤り";
  if (!query) return "";
  if (total === 0) return "0 件";
  const all = `${total}${capped ? "+" : ""}`;
  return current === null ? `${all} 件` : `${current + 1}/${all}`;
}

/** 置き換えの行（エディタの検索の欄だけ。VS Code と同じく左の ▸ で開く） */
export interface FindReplace {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string;
  onChange: (value: string) => void;
  /** 1 つ置き換える（Enter） */
  onReplace: () => void;
  /** すべて置き換える（⌘Enter） */
  onReplaceAll: () => void;
  /** 置き換えられるものがあるか */
  canReplace: boolean;
}

/**
 * 検索の欄（⌘F）。どこの検索でも同じ見た目と操作にする（利用者の依頼）: 枠の中に、虫眼鏡・入力・探し方（「Aa」「ab」「.*」。⌥⌘C / ⌥⌘W / ⌥⌘R）・
 * 件数・前へ・次へ・閉じる。Enter / ↓ で次、Shift+Enter / ↑ で前、Esc で onEscape（なければ閉じる）。
 * replace があれば、左に置き換えの行の開閉（▸）、開いていれば下に置き換えの行（Enter で 1 つ、⌘Enter ですべて）。
 * 置き場所（浮かせる・見出しの行に置く）は使う側の className で決める（styles/chat/chat-find.css の .find-box が見た目）。
 * 使う所: ページの検索の欄（FindBar）・チャットの中の検索（ChatFind）・メモのエディタ（memoFindPanel）・ファイルのエディタ（MonacoFindBar）
 */
export function FindField({
  inputRef,
  value,
  onChange,
  placeholder,
  invalid,
  options,
  onToggleOption,
  count,
  canStep,
  onStep,
  onClose,
  closeLabel = "検索を閉じる",
  onEscape,
  onKeyDown,
  replace,
  className,
  inputProps,
  onPointerDown,
}: {
  inputRef?: Ref<HTMLInputElement>;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  invalid: boolean;
  options: FindOptions;
  onToggleOption: (name: FindOptionName) => void;
  /** 件数の文（findCountText） */
  count: string;
  /** 前後へ移れるか（一致があるか） */
  canStep: boolean;
  onStep: (step: 1 | -1) => void;
  onClose: () => void;
  closeLabel?: string;
  /** Esc（入力欄・置き換えの欄で）。なければ閉じる */
  onEscape?: (e: KeyboardEvent<HTMLInputElement>) => void;
  /** 入力欄のキーを先に受け取る（受け取ったら true。メモのエディタの検索の欄のキー） */
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => boolean;
  replace?: FindReplace;
  className?: string;
  /** 入力欄に足す属性（title など） */
  inputProps?: Record<string, string>;
  /** 枠を押したとき（チャットの見出しの欄: どこを押しても入力欄にピント） */
  onPointerDown?: (e: PointerEvent<HTMLDivElement>) => void;
}) {
  const escape = (e: KeyboardEvent<HTMLInputElement>) => {
    if (onEscape) return onEscape(e);
    // パネル・右の欄を閉じる Esc に渡さない
    e.preventDefault();
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
    onClose();
  };
  const keyDown = (e: KeyboardEvent<HTMLInputElement>, field: "search" | "replace") => {
    if (isComposing(e) || onKeyDown?.(e) || handleFindOptionKey(e, onToggleOption)) return;
    if (isCancelKey(e)) return escape(e);
    if (field === "replace") {
      if (e.key !== "Enter") return;
      e.preventDefault();
      if (e.metaKey || e.ctrlKey) replace?.onReplaceAll();
      else replace?.onReplace();
      return;
    }
    if (e.key === "Enter" || e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      onStep(e.key === "ArrowUp" || (e.key === "Enter" && e.shiftKey) ? -1 : 1);
    }
  };

  const row = (icon: ReactNode, input: ReactNode, actions: ReactNode) => (
    <div className="find-box-row">
      {icon}
      {input}
      {actions}
    </div>
  );

  return (
    <div className={cx("find-box", invalid && "invalid", replace && "has-replace", className)} role="search" onPointerDown={onPointerDown}>
      {replace && (
        <IconButton
          type="button"
          icon={replace.open ? ChevronDown : ChevronRight}
          size={14}
          label={replace.open ? "置き換えを閉じる" : "置き換えを開く"}
          className="find-box-toggle"
          aria-expanded={replace.open}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => replace.onOpenChange(!replace.open)}
        />
      )}
      <div className="find-box-rows">
        {row(
          <Search size={13} className="find-box-icon" aria-hidden />,
          <input
            ref={inputRef}
            type="text"
            value={value}
            placeholder={placeholder}
            aria-label={placeholder}
            aria-invalid={invalid || undefined}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => keyDown(e, "search")}
            {...inputProps}
          />,
          // 探し方・件数・前後・閉じる（チャットの見出しの欄は、ピントがある・文があるときだけ見せる。.find-box-controls）
          <span className="find-box-controls">
            <FindOptionButtons options={options} onToggle={onToggleOption} size={14} />
            <span className={cx("find-box-count", invalid && "invalid")} aria-live="polite">
              {count}
            </span>
            <IconButton type="button" icon={ChevronUp} size={13} label="前へ" keys="⇧Enter" disabled={!canStep} onMouseDown={(e) => e.preventDefault()} onClick={() => onStep(-1)} />
            <IconButton type="button" icon={ChevronDown} size={13} label="次へ" keys="Enter" disabled={!canStep} onMouseDown={(e) => e.preventDefault()} onClick={() => onStep(1)} />
            <CloseButton type="button" size={13} label={closeLabel} keys="Esc" onClick={onClose} />
          </span>,
        )}
        {replace?.open &&
          row(
            <Replace size={13} className="find-box-icon" aria-hidden />,
            <input type="text" value={replace.value} placeholder="置き換え" aria-label="置き換える文" onChange={(e) => replace.onChange(e.target.value)} onKeyDown={(e) => keyDown(e, "replace")} />,
            <span className="find-box-controls">
              <IconButton type="button" icon={Replace} size={13} label="置き換える" keys="Enter" disabled={!replace.canReplace} onMouseDown={(e) => e.preventDefault()} onClick={replace.onReplace} />
              <IconButton type="button" icon={ReplaceAll} size={13} label="すべて置き換える" keys="⌘Enter" disabled={!replace.canReplace} onMouseDown={(e) => e.preventDefault()} onClick={replace.onReplaceAll} />
            </span>,
          )}
      </div>
    </div>
  );
}
