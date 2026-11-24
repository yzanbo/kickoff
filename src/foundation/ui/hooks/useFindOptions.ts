import { storage as uiStorage } from "./storage";
import { readSetting, subscribeSetting, writeSetting } from "@/foundation/ui/storage";
import type { FindOptionName, FindOptions } from "@/foundation/ui/lib/textFind";
import { useSetting } from "./useSetting";

/** 探し方ごとの保存先（どの検索の欄でも同じ値） */
const SETTINGS = { caseSensitive: uiStorage.settings.findCase, wholeWord: uiStorage.settings.findWholeWord, regex: uiStorage.settings.findRegex } as const;

/** いまの探し方（React の外。ノートのエディタの検索・Monaco の検索の欄に渡す） */
export function readFindOptions(): FindOptions {
  return { caseSensitive: readSetting(uiStorage.settings.findCase), wholeWord: readSetting(uiStorage.settings.findWholeWord), regex: readSetting(uiStorage.settings.findRegex) };
}

/** 探し方を書き換える（React の外。Monaco の検索の欄で切り替えたとき） */
export function writeFindOption(name: FindOptionName, on: boolean): void {
  if (readSetting(SETTINGS[name]) !== on) writeSetting(SETTINGS[name], on);
}

/** 探し方が変わったら呼ぶ（React の外。戻り値で外す） */
export function subscribeFindOptions(listener: () => void): () => void {
  const offs = Object.values(SETTINGS).map((s) => subscribeSetting(s, listener));
  return () => offs.forEach((off) => off());
}

/**
 * ⌘F の検索の欄の探し方（大文字・小文字を区別・単語単位・正規表現）と、切り替え。
 * どの検索の欄でも同じ値を覚え、ほかの欄・ウィンドウで切り替えてもそろう
 */
export function useFindOptions(): { options: FindOptions; toggle: (name: FindOptionName) => void } {
  const [caseSensitive, setCase] = useSetting(uiStorage.settings.findCase);
  const [wholeWord, setWholeWord] = useSetting(uiStorage.settings.findWholeWord);
  const [regex, setRegex] = useSetting(uiStorage.settings.findRegex);
  const options = { caseSensitive, wholeWord, regex };
  const toggle = (name: FindOptionName) => {
    if (name === "caseSensitive") setCase(!caseSensitive);
    else if (name === "wholeWord") setWholeWord(!wholeWord);
    else setRegex(!regex);
  };
  return { options, toggle };
}
