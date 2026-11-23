// 作業場所を移した区切りより前の行:
// その行のファイルのチップ・変更カード・「差分を見る」・ツールの行・読んだ画像を、その発言のときの作業場所から開く
import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { ProjectFiles } from "@shared/foundation/fileTypes";
import { workplaceBoundaries as boundariesOf, workplaceGoneText, type WorkplaceBoundary, type WorkplacePlace } from "@shared/workplaceMove/workplaceMoves";
import { api } from "@/foundation/ui/api";
import { createKeyedStore } from "@/foundation/ui/store/keyedStore";
import { useKeyedStores } from "@/foundation/ui/store/useStore";
import { useProjects } from "@/features/projects/ui/stores/projects";
import { showToast } from "@/foundation/ui/kit/toast";
import { chatFileLinksPort, type ChatFileSource } from "./fileLinks";
import { memoLast } from "@/features/chat/ui/store/chatSelector";
import { defineChatSelector } from "@/features/chat/ui/store/useChatStore";

const NO_BOUNDARIES: readonly WorkplaceBoundary[] = [];

/** 作業場所を移した区切り（ID の順。索引にいつも入るので、末尾より前のものも。記録が増えても区切りが同じなら同じ配列） */
export const workplaceBoundaries = defineChatSelector(["log"], () => {
  let moves: { key: string; list: readonly WorkplaceBoundary[] } = { key: "", list: NO_BOUNDARIES };
  const of = memoLast((digest: Parameters<typeof boundariesOf>[0]): readonly WorkplaceBoundary[] => {
    const list = boundariesOf(digest);
    const key = list.map((b) => b.id).join(" ");
    if (key !== moves.key) moves = { key, list: list.length ? list : NO_BOUNDARIES };
    return moves.list;
  });
  return (src, chatId) => of(src.log(chatId).digest);
});

/** その記録が、作業場所を移した区切りより前か（区切りが変わったときだけ描き直す） */
export const useBeforeWorkplaceMove = (chatId: number, eventId: number): boolean => workplaceBoundaries.useWith(chatId, (list) => list.some((b) => b.id > eventId));

/** 区切りより前の区間 1 つの開き方 */
interface PastPlace {
  /** 画像の口に渡す記録の ID（区間の終わり。コアはこれより後ろの最初の区切りの「移す前」から読む） */
  at: number;
  /** ファイルを押して開く情報（読めるまでは undefined = チップにしない） */
  links: ChatFileSource | undefined;
  /** そのときの作業場所がもうない（チップを薄く出し、押したら開けないと知らせる） */
  gone: boolean;
}

/** 区切りの ID → その区切りより前の区間の開き方（ID の小さい順。区切りがなければ null） */
const PastWorkplacesContext = createContext<ReadonlyMap<number, PastPlace> | null>(null);
/** 区切りより前の行の中なら、画像の口に渡す記録の ID（いまの作業場所の行は undefined） */
const PastWorkplaceAtContext = createContext<number | undefined>(undefined);

/** 区切りより前の行の中なら、画像の口に渡す記録の ID（ツールの結果の画像・返答の手元の画像） */
export const usePastWorkplaceAt = (): number | undefined => useContext(PastWorkplaceAtContext);

const placeKey = (place: WorkplacePlace) => `${place.project_id}\n${place.worktree_path ?? ""}`;

/** 移す前の作業場所のファイルの一覧（移したあとはこのチャットが変えないので、作業が終わっても読み直さない） */
const pastFiles = createKeyedStore<string, ProjectFiles>({
  load: (key) => {
    const [projectId, worktree] = key.split("\n");
    return api.projectFiles({ projectId: Number(projectId), worktree: worktree || undefined });
  },
});

/**
 * チャットの画面に、作業場所を移した区切りより前の区間ごとの開き方を配る（区切りがなければ何もしない）。
 * 移す前の作業場所のファイルの一覧は、区間ごとではなく作業場所ごとに 1 回だけ読む。current はいまの作業場所の開き方
 */
export function PastWorkplacesProvider({
  chatId,
  current,
  side,
  adapt,
  children,
}: {
  chatId: number;
  current: ChatFileSource | undefined;
  side: boolean;
  /** 開き方を直す（別ウィンドウ: そのときの作業場所の別ウィンドウで開く） */
  adapt?: (links: ChatFileSource, place: { projectId: number; worktree?: string }) => ChatFileSource;
  children: ReactNode;
}) {
  const boundaries = workplaceBoundaries.useFor(chatId);
  const { projectsById } = useProjects();
  const stateOf = useKeyedStores(
    pastFiles,
    boundaries.map((b) => placeKey(b.from)),
    { active: boundaries.length > 0 },
  );
  const value = useMemo(() => {
    if (boundaries.length === 0) return null;
    const map = new Map<number, PastPlace>();
    const port = chatFileLinksPort();
    const adaptLinks = (links: ChatFileSource, place: { projectId: number; worktree?: string }) => (adapt ? adapt(links, place) : links);
    for (const b of boundaries) {
      const state = stateOf(placeKey(b.from));
      const worktree = b.from.worktree_path ?? undefined;
      const root = worktree ?? projectsById.get(b.from.project_id)?.repo_path;
      const gone = state.data === undefined && state.error !== undefined;
      const links =
        state.data && root
          ? adaptLinks(port.sourceFor({ chatId, projectId: b.from.project_id, worktree, root, side }, state.data), { projectId: b.from.project_id, ...(worktree ? { worktree } : {}) })
          : gone && current
            ? // そのときの作業場所がもうない: チップはいまの一覧の名前で出し、押すと開けないと知らせる
              port.goneSource(current, root, () => showToast(workplaceGoneText(b.fromLabel)))
            : undefined;
      map.set(b.id, { at: b.id - 1, links, gone });
    }
    return map;
  }, [boundaries, stateOf, projectsById, chatId, side, current, adapt]);
  return <PastWorkplacesContext.Provider value={value}>{children}</PastWorkplacesContext.Provider>;
}

/** 流れの行 1 つを、その行の記録のときの作業場所で包む（区切りより後ろの行はそのまま） */
export function PastWorkplace({ eventId, children }: { eventId: number | undefined; children: ReactNode }) {
  const places = useContext(PastWorkplacesContext);
  if (!places || eventId === undefined) return children;
  let place: PastPlace | undefined;
  for (const [id, p] of places) {
    if (id > eventId) {
      place = p;
      break;
    }
  }
  if (!place) return children;
  const FileLinks = chatFileLinksPort().Provider;
  return (
    <PastWorkplaceAtContext.Provider value={place.at}>
      <FileLinks source={place.links}>{place.gone ? <div className="past-workplace-gone">{children}</div> : children}</FileLinks>
    </PastWorkplaceAtContext.Provider>
  );
}
