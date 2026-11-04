import { useCallback, useEffect, useRef, useState } from "react";
import type { Project, Chat, ChatGroup } from "@shared/types";
import { api } from "@/api";
import { errorMessage } from "@shared/errors";
import { useServerEvent } from "@/api/events";
import { useChats } from "@/stores/chats";
import { groupsStore, NO_GROUPS } from "@/stores/groups";
import { useKeyedStore } from "@/stores/useStore";

/** プロジェクト画面に出すもの（プロジェクト・チャット・グループ） */
export interface ProjectData {
  project: Project;
  chats: Chat[];
  groups: ChatGroup[];
}

/** プロジェクトごとの直前のプロジェクト（プロジェクトを切り替えたときに、すぐ出すため） */
const projectCache = new Map<number, Project>();

/**
 * プロジェクト画面のデータ。プロジェクトを取り、サーバーのイベントで取り直す（チャットとグループは店から読む）。
 * 一度開いたプロジェクトは、切り替えたときにすぐ出す（裏で読み直す。「読み込み中」を挟んでちらつかないように）。
 * data が別のプロジェクトのもの（data.project.id !== id）の間は、画面の側で前の画面を薄くして出す
 */
export function useProjectData(id: number) {
  const [project, setProject] = useState<Project | undefined>(() => projectCache.get(id));
  const [error, setError] = useState<string>();
  // 取り直している最中か（タブの数の代わりに更新中の印を出す）。続けて呼ばれても、すべて終わるまで true
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(0);

  const load = useCallback(async () => {
    inFlight.current++;
    setLoading(true);
    try {
      const next = await api.project(id);
      projectCache.set(id, next);
      setProject(next);
      setError(undefined);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      if (--inFlight.current === 0) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    // 覚えていればそれを出す。初めてのプロジェクトは、読み終わるまで前の画面を薄くして残す
    const cached = projectCache.get(id);
    if (cached) setProject(cached);
    void load();
  }, [id, load]);

  useServerEvent((e) => {
    if (e.type === "project" && e.project.id === id) void load();
  });

  // 切り替えた直後も、覚えている内容があれば最初の描画から使う（前のプロジェクトが一瞬映らないように）
  const shown = project?.id === id ? project : (projectCache.get(id) ?? project);
  // チャットとグループは、出しているプロジェクトのもの（前のプロジェクトを薄くして出している間は、そのプロジェクトのもの）
  const chats = useChats({ projectId: shown?.id ?? id });
  const groups = useKeyedStore(groupsStore, shown?.id ?? id);
  return {
    data: shown && { project: shown, chats: chats.chats, groups: groups.data ?? NO_GROUPS },
    error: error ?? chats.error ?? groups.error,
    loading: loading || chats.loading || groups.loading,
  };
}
