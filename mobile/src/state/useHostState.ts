// 1 つの本体の一覧の様子（プロジェクト・チャット・回答待ち・この端末のできること）。つながるたびに読み直し、知らせで直す
import { useEffect, useState } from "react";
import type { DeviceAccess } from "@shared/types";
import { applyHostEvent, emptyHostState, type HostState } from "../lib/hostState";
import { useHosts, useHostSession } from "./hosts";

export function useHostState(hostId: string) {
  const { session, state: connection } = useHostSession(hostId);
  const { registry, reload } = useHosts();
  const [state, setState] = useState<HostState>(emptyHostState);
  const [access, setAccess] = useState<DeviceAccess>("full");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    const load = async () => {
      try {
        const [projects, chats, approvals, self] = await Promise.all([session.client.projects(), session.client.request<HostState["chats"]>("GET", "/api/chats"), session.client.approvals(), session.client.self()]);
        setState({ projects, chats, approvals });
        setAccess(self.access);
        // できることが本体で変わっていたら覚え直す（一覧の「見るだけ」の札）
        const record = (await registry.list()).find((h) => h.host_id === hostId);
        if (record && record.access !== self.access) await registry.update(hostId, { access: self.access }).then(reload);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    };
    if (session.state.kind === "open") void load();
    const offOpen = session.onOpen(() => void load());
    const offEvent = session.onEvent((e) => setState((s) => applyHostEvent(s, e)));
    return () => {
      offOpen();
      offEvent();
    };
  }, [session, hostId, registry, reload]);

  return { session, connection, state, access, error };
}
