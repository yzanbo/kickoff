import { useEffect, useEffectEvent, useRef } from "react";
import type { DockerActionBody, DockerList } from "@shared/docker/types";
import { DOCKER_SHARED_PROJECT } from "@shared/docker/types";
import { ApiError } from "@/foundation/ui/api/http";
import { errorText, useQuery } from "@/foundation/ui/query";
import { confirm, reportFailure } from "@/foundation/ui/kit/ask";
import { dockerApi } from "./api/docker";

/** 「見ています」を送る間隔（コアは 45 秒届かなければ docker events を止める） */
const WATCH_INTERVAL_MS = 20_000;
/** エンジンを開いたあとに調べ直す間隔と長さ */
const ENGINE_POLL_MS = 2_000;
const ENGINE_POLL_LIMIT_MS = 30_000;

/** 次の取り直しの頼み方（重なったら強いほう: ［↻］ > 見ています > ふつう） */
type LoadMode = "list" | "watch" | "refresh";
const MODE_RANK: Record<LoadMode, number> = { list: 0, watch: 1, refresh: 2 };

/**
 * Docker タブの状態と操作: 開いている間は 20 秒ごとに「見ています」を送り（ウィンドウが隠れている間は送らず、戻ったらすぐ送る）、
 * SSE の docker_changed で取り直す（重なった取り直しは 1 回にまとめ、終わってからもう 1 回）。
 * 操作は待たずに始まり、別の作業場所と同じ組になる起動は確かめてから送り直す
 */
export function useDocker(projectId: number) {
  // 次の取り直しで送る頼み（開いた瞬間は「見ています」。取りに行くときに読んでふつうに戻す）
  const mode = useRef<LoadMode>("watch");
  const query = useQuery<DockerList>(
    ["docker", projectId],
    () => {
      const next = mode.current;
      mode.current = "list";
      return next === "watch" ? dockerApi.dockerWatch(projectId) : dockerApi.dockerList(projectId, next === "refresh");
    },
    {
      dedupe: "trailing",
      keepPrevious: true,
      refetchOn: { docker_changed: (e) => e.project_id === projectId },
      refetchOnOpen: false,
    },
  );
  const { setData } = query;

  /** 取り直す（refresh = 覚えた compose の設定も読み直す ［↻］・watch = 「見ています」として送る） */
  const reload = (opts: { refresh?: boolean; watch?: boolean } = {}) => {
    const want: LoadMode = opts.refresh ? "refresh" : opts.watch ? "watch" : "list";
    if (MODE_RANK[want] > MODE_RANK[mode.current]) mode.current = want;
    return query.reload();
  };

  // 20 秒ごとに「見ています」を送る。隠れている間は送らず、隠れていたウィンドウに戻ったらすぐ送る
  const watchNow = useEffectEvent(() => {
    if (!document.hidden) void reload({ watch: true });
  });
  useEffect(() => {
    const timer = setInterval(watchNow, WATCH_INTERVAL_MS);
    document.addEventListener("visibilitychange", watchNow);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", watchNow);
    };
  }, []);

  /** 操作を送る（別の作業場所と同じ組になる起動は、確かめてから confirm_shared で送り直す） */
  const act = async (body: DockerActionBody) => {
    // 始めたあとの一覧が届けばそのまま出し、届かなければ（cancel・dismiss・失敗）取り直す
    const show = (next: DockerList | undefined | void) => (next ? setData(next) : void reload());
    try {
      show(await dockerApi.dockerAction(projectId, body));
    } catch (e) {
      if (e instanceof ApiError && e.code === DOCKER_SHARED_PROJECT) {
        const ok = await confirm({
          title: "同じ組の名前です",
          message: e.message,
          confirmLabel: "起動する",
        });
        if (ok) show(await dockerApi.dockerAction(projectId, { ...body, confirm_shared: true }).catch(reportFailure("起動できませんでした")));
        return;
      }
      reportFailure("Docker の操作ができませんでした")(e);
      void reload();
    }
  };

  /** エンジンを開き（OrbStack・Docker Desktop）、2 秒ごとに 30 秒まで調べ直す */
  const openEngine = async () => {
    await dockerApi.dockerOpenEngine(projectId).catch(reportFailure("開けませんでした"));
    const until = Date.now() + ENGINE_POLL_LIMIT_MS;
    const poll = async () => {
      const next = await dockerApi.dockerList(projectId).catch(() => null);
      if (next) setData(next);
      if (next?.engine === "ok") return void reload({ watch: true });
      if (Date.now() < until) setTimeout(() => void poll(), ENGINE_POLL_MS);
    };
    setTimeout(() => void poll(), ENGINE_POLL_MS);
  };

  return {
    list: query.data ?? null,
    error: query.error ? errorText(query.error) : null,
    reload,
    act,
    openEngine,
  };
}
