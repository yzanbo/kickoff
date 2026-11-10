import { CaseSensitive, Regex, WholeWord } from "lucide-react";
import type { KeyboardEvent } from "react";
import { cx } from "@/lib/cx";
import { FIND_OPTION_LABELS, FIND_OPTION_NAMES, findOptionOfKey, type FindOptionName, type FindOptions } from "@/lib/textFind";
import { IconButton } from "./IconButton";

const ICONS = { caseSensitive: CaseSensitive, wholeWord: WholeWord, regex: Regex } as const;

/**
 * 検索の欄の探し方の切り替え（VS Code と同じ「Aa」「ab」「.*」。入れているときは .find-option.on）。
 * チャットの中の検索・ページの検索の欄（FindBar）・メモのエディタの検索で同じ見た目にする。値は hooks/useFindOptions
 */
export function FindOptionButtons({ options, onToggle, size = 15 }: { options: FindOptions; onToggle: (name: FindOptionName) => void; size?: number }) {
  return (
    <>
      {FIND_OPTION_NAMES.map((name) => (
        <IconButton
          key={name}
          type="button"
          icon={ICONS[name]}
          label={FIND_OPTION_LABELS[name].label}
          keys={FIND_OPTION_LABELS[name].keys}
          size={size}
          className={cx("find-option", options[name] && "on")}
          aria-pressed={options[name]}
          // 押しても入力欄のピントを外さない（打ちながら切り替える）
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onToggle(name)}
        />
      ))}
    </>
  );
}

/** 検索の欄の入力で ⌥⌘C / ⌥⌘W / ⌥⌘R を押したら、その探し方を切り替える（受け取ったら true） */
export function handleFindOptionKey(e: KeyboardEvent, onToggle: (name: FindOptionName) => void): boolean {
  const name = findOptionOfKey(e);
  if (!name) return false;
  e.preventDefault();
  onToggle(name);
  return true;
}
