// 作業場所を移した区切りより前の行（メモの仕様書「0025_チャットの作業場所を変える」の Q4・H5）:
// その行のファイルのチップ・変更カード・「差分を見る」・ツールの行・読んだ画像を、その発言のときの作業場所から開く
import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { ProjectFiles } from "@shared/types";
import { workplaceGoneText, type WorkplacePlace } from "@shared/chat/workplaceMoves";
import { api } from "@/api";
import { createKeyedStore } from "@/stores/keyedStore";
import { useKeyedStores } from "@/stores/useStore";
import { useProjects } from "@/stores/projects";
import { showToast } from "@/ui/toast";
import { FileLinksProvider } from "@/features/fileLinks/FileLinksProvider";
import { fileLinksFor, type ChatFileLinks } from "@/features/fileLinks/useFileLinks";
import { useWorkplaceBoundaries } from "@/features/chat/store/useChatStore";

/** 区切りより前の区間 1 つの開き方 */
interface PastPlace {
  /** 画像の口に渡す記録の ID（区間の終わり。コアはこれより後ろの最初の区切りの「移す前」から読む） */
  at: number;
  /** ファイルを押して開く情報（読めるまでは undefined = チップにしない） */
  links: ChatFileLinks | undefined;
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
 * そのときの作業場所がもうないときの開き方: チップはいまの一覧の名前で出し（作業場所のフォルダはそのときのもの。変更カードの絶対パスも
 * 作業場所の中として読む）、押すと開けないと知らせる
 */
function goneLinks(current: ChatFileLinks, root: string, label: string): ChatFileLinks {
  const tell = () => showToast(workplaceGoneText(label));
  return { index: { ...current.index, root }, side: current.side, open: tell, openInEditor: tell, openChanges: tell };
}

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
  current: ChatFileLinks | undefined;
  side: boolean;
  /** 開き方を直す（別ウィンドウ: そのときの作業場所の別ウィンドウで開く） */
  adapt?: (links: ChatFileLinks, place: { projectId: number; worktree?: string }) => ChatFileLinks;
  children: ReactNode;
}) {
  const boundaries = useWorkplaceBoundaries(chatId);
  const { projectsById } = useProjects();
  const stateOf = useKeyedStores(
    pastFiles,
    boundaries.map((b) => placeKey(b.from)),
    { active: boundaries.length > 0 },
  );
  const value = useMemo(() => {
    if (boundaries.length === 0) return null;
    const map = new Map<number, PastPlace>();
    const adaptLinks = (links: ChatFileLinks, place: { projectId: number; worktree?: string }) => (adapt ? adapt(links, place) : links);
    for (const b of boundaries) {
      const state = stateOf(placeKey(b.from));
      const worktree = b.from.worktree_path ?? undefined;
      const root = worktree ?? projectsById.get(b.from.project_id)?.repo_path;
      const gone = state.data === undefined && state.error !== undefined;
      const links =
        state.data && root
          ? adaptLinks(fileLinksFor({ files: state.data, root, projectId: b.from.project_id, worktree, chatId, side }), { projectId: b.from.project_id, ...(worktree ? { worktree } : {}) })
          : gone && current
            ? goneLinks(current, root ?? current.index.root, b.fromLabel)
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
  return (
    <PastWorkplaceAtContext.Provider value={place.at}>
      <FileLinksProvider value={place.links}>{place.gone ? <div className="past-workplace-gone">{children}</div> : children}</FileLinksProvider>
    </PastWorkplaceAtContext.Provider>
  );
}
