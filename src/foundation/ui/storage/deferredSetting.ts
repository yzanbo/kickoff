// 遅らせる設定の書き込み（打つたびに書かず、止まってから書く。窓を閉じる・読み込み直す前に書き出す）
import { writeSetting, type Setting } from "./settings";

export interface DeferredSetting<T> {
  /** 書く値を預ける（ms 待ってから書く。待っている間に預け直したら、最後の値だけを書く） */
  write(value: T): void;
  /** 預けている値をいま書く（なければ何もしない） */
  flush(): void;
  /** 預けている値を書かずに捨てる */
  cancel(): void;
}

/** setting への書き込みを ms だけ遅らせる。預けている間は pagehide（窓を閉じる・読み込み直す）でも書き出す */
export function deferredSetting<T>(setting: Setting<T>, ms = 400): DeferredSetting<T> {
  let pending: { value: T } | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    clearTimeout(timer);
    timer = undefined;
    window.removeEventListener("pagehide", flush);
  };
  function flush() {
    const next = pending;
    pending = null;
    stop();
    if (next) writeSetting(setting, next.value);
  }
  return {
    write(value) {
      if (!pending) window.addEventListener("pagehide", flush);
      pending = { value };
      clearTimeout(timer);
      timer = setTimeout(flush, ms);
    },
    flush,
    cancel() {
      pending = null;
      stop();
    },
  };
}
