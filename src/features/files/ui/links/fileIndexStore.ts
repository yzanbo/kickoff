import { resolveFilePath, type FileIndex } from "./fileRefs";

/**
 * チャットの作業場所のファイルの一覧の小さな店（FileLinksProvider が 1 つ持つ）。返答の中のファイルのリンクは、
 * 自分のパスを引き当てた結果だけを選んで読む（useSyncExternalStore）ので、一覧が変わっても描き直るのは結果の変わったリンクだけ
 * （返答の Markdown は解析し直さない。新しくできたファイルのパスも、一覧に入ればあとから押せるようになる）
 */
export interface FileIndexStore {
  /** 一覧を入れ替える（知らせは出さない。描き直しの最中に呼べるように。変わったら true） */
  replace: (index: FileIndex | undefined) => boolean;
  /** 一覧が変わったことを読んでいるリンクに知らせる（描いたあとに呼ぶ） */
  notify: () => void;
  subscribe: (onChange: () => void) => () => void;
  /** パスらしい文字を一覧に引き当てる（一覧にない・決まらない・一覧がまだなければ undefined） */
  resolve: (path: string) => string | undefined;
}

export function createFileIndexStore(): FileIndexStore {
  let index: FileIndex | undefined;
  const listeners = new Set<() => void>();
  return {
    replace: (next) => {
      if (next === index) return false;
      index = next;
      return true;
    },
    notify: () => listeners.forEach((fn) => fn()),
    subscribe: (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    resolve: (path) => (index ? resolveFilePath(path, index) : undefined),
  };
}
