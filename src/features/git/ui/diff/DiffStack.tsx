import { Fragment, useEffect, useEffectEvent, useRef, useState, type ReactNode, type RefObject } from "react";

/** これより多いときは、初めはファイルを畳んでおく（差分を一度に読み込みすぎない。移る先のファイルだけ開く） */
const OPEN_ALL_MAX = 20;

/** 1 つのファイルの開閉: override = 自分で開閉したとき（なければ決まりで決める）・byDefault = 決まりで開くか */
export interface StackFold {
  override: boolean | undefined;
  byDefault: boolean;
  set: (open: boolean) => void;
  /** 自分で開閉したことを忘れて、決まりに戻す */
  reset: () => void;
}

/**
 * ファイルごとの差分を縦に積む（チャットの右の欄の「変更」）。開閉を覚え、ファイルが openAllMax より多ければ移る先のファイルだけ開く。
 * focus のファイルへ移る（focusAt が変わるたびに。一覧が届くのを待つ）。ファイルの包みは pathAttr にパスを書く（移る先を探す）
 */
export function DiffStack<F extends { path: string }>({
  files,
  scroller,
  focus,
  focusAt,
  pathAttr = "data-change-path",
  openAllMax = OPEN_ALL_MAX,
  list,
  section,
}: {
  files: readonly F[];
  scroller: RefObject<HTMLElement | null>;
  focus?: string;
  focusAt?: number;
  pathAttr?: string;
  openAllMax?: number;
  /** 差分の上に出す一覧（reveal でそのファイルへ移る） */
  list?: (reveal: (path: string) => void) => ReactNode;
  section: (file: F, fold: StackFold) => ReactNode;
}) {
  const [toggled, setToggled] = useState<ReadonlyMap<string, boolean>>(new Map());
  const setOpen = (path: string, open: boolean) => setToggled((m) => new Map(m).set(path, open));
  const reset = (path: string) =>
    setToggled((m) => {
      const next = new Map(m);
      next.delete(path);
      return next;
    });
  /** そのファイルの差分の位置へ移る（畳んでいれば開く） */
  const reveal = (path: string) => {
    setOpen(path, true);
    requestAnimationFrame(() => scroller.current?.querySelector(`[${pathAttr}="${CSS.escape(path)}"]`)?.scrollIntoView({ block: "start" }));
  };
  // 押したファイルへ移る（一覧が届くのを待つ。同じファイルを押し直したときも focusAt が変わるので移る）
  const pending = useRef<number | undefined>(undefined);
  useEffect(() => {
    pending.current = focusAt;
  }, [focusAt]);
  const revealFocus = useEffectEvent((path: string) => reveal(path));
  useEffect(() => {
    if (!focus || pending.current === undefined || !files.some((f) => f.path === focus)) return;
    pending.current = undefined;
    revealFocus(focus);
  }, [focus, focusAt, files]);

  return (
    <>
      {list?.(reveal)}
      {files.map((file) => (
        <Fragment key={file.path}>
          {section(file, {
            override: toggled.get(file.path),
            byDefault: files.length <= openAllMax || file.path === focus,
            set: (open) => setOpen(file.path, open),
            reset: () => reset(file.path),
          })}
        </Fragment>
      ))}
    </>
  );
}
