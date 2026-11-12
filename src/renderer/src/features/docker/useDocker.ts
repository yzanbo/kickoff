import { useCallback, useEffect, useRef, useState } from "react";
import type { DockerActionBody, DockerList } from "@shared/types";
import { DOCKER_SHARED_PROJECT } from "@shared/types";
import { errorMessage } from "@shared/errors";
import { api } from "@/api";
import { ApiError } from "@/api/http";
import { useServerEvent } from "@/api/events";
import { confirmDialog, reportFailure } from "@/ui/dialogs";

/** 「見ています」を送る間隔（コアは 45 秒届かなければ docker events を止める） */
const WATCH_INTERVAL_MS = 20_000;
/** エンジンを開いたあとに調べ直す間隔と長さ */
const ENGINE_POLL_MS = 2_000;
const ENGINE_POLL_LIMIT_MS = 30_000;

/**
 * Docker タブの状態と操作: 開いている間は 20 秒ごとに「見ています」を送り（ウィンドウが隠れている間は送らない）、
 * SSE の docker_changed で取り直す。操作は待たずに始まり、別の作業場所と同じ組になる起動は確かめてから送り直す
 */
export function useDocker(projectId: number) {
  const [list, setList] = useState<DockerList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loading = useRef(false);
  const again = useRef(false);

  /** 取り直す（重なった頼みは 1 回にまとめ、終わってからもう 1 回だけ） */
  const reload = useCallback(
    async (opts: { refresh?: boolean; watch?: boolean } = {}) => {
      if (loading.current && !opts.refresh) {
        again.current = true;
        return;
      }
      loading.current = true;
      try {
        const next = opts.watch ? await api.dockerWatch(projectId) : await api.dockerList(projectId, opts.refresh);
        setList(next);
        setError(null);
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        loading.current = false;
        if (again.current) {
          again.current = false;
          void reload();
        }
      }
    },
    [projectId],
  );

  // 開いた瞬間に「見ています」を送り（今の一覧も返る）、20 秒ごとに送り続ける。隠れていたウィンドウに戻ったらすぐ送る
  useEffect(() => {
    void reload({ watch: true });
    const timer = setInterval(() => {
      if (!document.hidden) void reload({ watch: true });
    }, WATCH_INTERVAL_MS);
    const onVisible = () => {
      if (!document.hidden) void reload({ watch: true });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reload]);

  useServerEvent((e) => {
    if (e.type === "docker_changed" && e.project_id === projectId) void reload();
  });

  /** 操作を送る（別の作業場所と同じ組になる起動は、確かめてから confirm_shared で送り直す） */
  const act = useCallback(
    async (body: DockerActionBody) => {
      // 始めたあとの一覧が届けばそのまま出し、届かなければ（cancel・dismiss・失敗）取り直す
      const show = (next: DockerList | undefined | void) => (next ? setList(next) : void reload());
      try {
        show(await api.dockerAction(projectId, body));
      } catch (e) {
        if (e instanceof ApiError && e.code === DOCKER_SHARED_PROJECT) {
          const ok = await confirmDialog({ title: "同じ組の名前です", message: e.message, confirmLabel: "起動する" });
          if (ok) show(await api.dockerAction(projectId, { ...body, confirm_shared: true }).catch(reportFailure("起動できませんでした")));
          return;
        }
        reportFailure("Docker の操作ができませんでした")(e);
        void reload();
      }
    },
    [projectId, reload],
  );

  /** エンジンを開き（OrbStack・Docker Desktop）、2 秒ごとに 30 秒まで調べ直す */
  const openEngine = useCallback(async () => {
    await api.dockerOpenEngine(projectId).catch(reportFailure("開けませんでした"));
    const until = Date.now() + ENGINE_POLL_LIMIT_MS;
    const poll = async () => {
      const next = await api.dockerList(projectId).catch(() => null);
      if (next) setList(next);
      if (next?.engine === "ok") return void reload({ watch: true });
      if (Date.now() < until) setTimeout(() => void poll(), ENGINE_POLL_MS);
    };
    setTimeout(() => void poll(), ENGINE_POLL_MS);
  }, [projectId, reload]);

  return { list, error, reload, act, openEngine };
}
