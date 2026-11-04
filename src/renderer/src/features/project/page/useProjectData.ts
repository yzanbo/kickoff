import { useCallback, useEffect, useRef, useState } from "react";
import type { Project, Chat, ChatGroup } from "@shared/types";
import { api } from "@/api";
import { errorMessage } from "@shared/errors";
import { useServerEvent } from "@/api/events";

/** プロジェクト画面に出すもの（プロジェクト・チャット・グループ） */
export interface ProjectData {
  project: Project;
  chats: Chat[];
  groups: ChatGroup[];
}

/** プロジェクトごとの直前のデータ（プロジェクトを切り替えたときに、すぐ出すため） */
const projectCache = new Map<number, ProjectData>();

/**
 * プロジェクト画面のデータを取り、サーバーのイベントで取り直す。
 * 一度開いたプロジェクトは、切り替えたときにすぐ出す（裏で読み直す。「読み込み中」を挟んでちらつかないように）。
 * data が別のプロジェクトのもの（data.project.id !== id）の間は、画面の側で前の画面を薄くして出す
 */
export function useProjectData(id: number) {
  const [data, setData] = useState<ProjectData | undefined>(() => projectCache.get(id));
  const [error, setError] = useState<string>();
  // 取り直している最中か（タブの数の代わりに更新中の印を出す）。続けて呼ばれても、すべて終わるまで true
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(0);

  const load = useCallback(async () => {
    inFlight.current++;
    setLoading(true);
    try {
      const [project, chats, groups] = await Promise.all([api.project(id), api.chats(id), api.groups(id)]);
      const next = { project, chats, groups };
      projectCache.set(id, next);
      setData(next);
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
    if (cached) setData(cached);
    void load();
  }, [id, load]);

  useServerEvent((e) => {
    const related =
      (e.type === "project" && e.project.id === id) ||
      // ほかのプロジェクトへ移した（このプロジェクトの一覧にある）チャットも
      (e.type === "chat" && (e.chat.project_id === id || Boolean(data?.chats.some((r) => r.id === e.chat.id)))) ||
      (e.type === "chat_deleted" && e.project_id === id) ||
      (e.type === "group" && e.group.project_id === id) ||
      (e.type === "group_deleted" && e.project_id === id);
    if (related) void load();
  });

  // 切り替えた直後も、覚えている内容があれば最初の描画から使う（前のプロジェクトが一瞬映らないように）
  const shown = data?.project.id === id ? data : (projectCache.get(id) ?? data);
  return { data: shown, error, loading };
}
