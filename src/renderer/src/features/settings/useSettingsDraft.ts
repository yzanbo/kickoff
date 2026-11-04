import { useEffect, useState } from "react";
import type { AppSettings } from "@shared/types";
import { api } from "@/api";
import { useSave } from "@/hooks/useSave";
import { settingsStore, useAppSettings } from "@/stores/settings";

/**
 * アプリの設定を下書きにし、項目ごとに保存する（設定のダイアログのタブごとに使う）。
 * 設定は店（stores/settings.ts）から読み、届いたら 1 回だけ下書きにする（ほかで設定が変わっても、書いている途中の下書きは変えない）
 */
export function useSettingsDraft() {
  const settings = useAppSettings().data;
  // 下書きの元（開いたときの設定。保存したら、保存した内容）
  const [base, setBase] = useState<AppSettings>();
  const [draft, setDraft] = useState<AppSettings>();
  const save = useSave();

  useEffect(() => {
    if (settings && !base) {
      setBase(settings);
      setDraft(settings);
    }
  }, [settings, base]);

  const dirty = Boolean(draft && base && JSON.stringify(draft) !== JSON.stringify(base));
  /** 渡した項目を保存し、元の値と下書きを保存した内容にする */
  const saveFields = async (patch: Partial<AppSettings>) => {
    const saved = await api.updateSettings(patch);
    settingsStore.set(saved);
    setBase(saved);
    setDraft(saved);
  };
  return { draft, setDraft, dirty, save, saveFields };
}
