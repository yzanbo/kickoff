import { useEffect, useState } from "react";
import type { AppSettings } from "../../../../core/types";
import { api, useAsync } from "../../api";
import { useSave } from "../../hooks/useSave";

/** アプリの設定を読み込んで下書きにし、項目ごとに保存する（設定のダイアログのタブごとに使う） */
export function useSettingsDraft() {
  const settings = useAsync(api.settings);
  const [draft, setDraft] = useState<AppSettings>();
  const save = useSave();

  useEffect(() => {
    if (settings.data) setDraft(settings.data);
  }, [settings.data]);

  const dirty = Boolean(draft && settings.data && JSON.stringify(draft) !== JSON.stringify(settings.data));
  /** 渡した項目を保存し、元の値も保存した内容にする */
  const saveFields = async (patch: Partial<AppSettings>) => settings.setData(await api.updateSettings(patch));
  return { draft, setDraft, dirty, save, saveFields };
}
