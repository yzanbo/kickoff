import { COUNTED_COLUMNS, type StateCounts } from "@/features/chat/ui";

/** 下地は一度だけ読み、読み込み中に別の更新や取り消しが来たら古い数は描かない */
export function createDockIconUpdater<Base>({ loadBase, draw, setIcon }: {
  loadBase: () => Promise<Base | null>;
  draw: (base: Base, counts: StateCounts) => string | null;
  setIcon: (dataUrl: string | null) => void;
}): (counts: StateCounts | null) => Promise<void> {
  let baseImage: Promise<Base | null> | null = null;
  let revision = 0;
  return async (counts) => {
    const current = ++revision;
    if (!counts || COUNTED_COLUMNS.every((column) => counts[column] === 0)) {
      setIcon(null);
      return;
    }
    baseImage ??= loadBase().catch(() => null);
    const base = await baseImage;
    if (current !== revision) return;
    setIcon(base === null ? null : draw(base, counts));
  };
}
