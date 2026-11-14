// つないだ本体の一覧と、本体ごとのつながり（HostSession）をアプリ全体で 1 つずつ持つ。
// 表に出ている間だけつなぎ、裏に回したら止める（裏の知らせはプッシュに頼る）
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import * as SecureStore from "expo-secure-store";
import { HostRegistry, type HostRecord } from "../lib/hosts";
import { HostSession, type SessionState } from "./hostSession";

interface HostsValue {
  hosts: HostRecord[];
  loaded: boolean;
  registry: HostRegistry;
  /** 本体のつながり（なければ null。一覧を読む前・外した本体） */
  session(hostId: string): HostSession | null;
  reload(): Promise<void>;
}

const HostsContext = createContext<HostsValue | null>(null);

export function HostsProvider({ children }: { children: ReactNode }) {
  const registry = useMemo(() => new HostRegistry(SecureStore), []);
  const [hosts, setHosts] = useState<HostRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const sessions = useRef(new Map<string, HostSession>());

  const reload = useCallback(async () => {
    const list = await registry.list();
    // 外した本体のつながりは止め、新しい本体はつなぐ
    for (const [id, s] of sessions.current) {
      if (!list.some((h) => h.host_id === id)) {
        s.stop();
        sessions.current.delete(id);
      }
    }
    for (const h of list) {
      const current = sessions.current.get(h.host_id);
      if (current && current.client.access.url === h.url) continue;
      current?.stop();
      const token = await registry.token(h.host_id);
      if (!token) continue;
      const s = new HostSession(h.host_id, h.url, token);
      sessions.current.set(h.host_id, s);
      if (AppState.currentState === "active") s.start();
    }
    setHosts(list);
    setLoaded(true);
  }, [registry]);

  useEffect(() => {
    void reload();
    const sub = AppState.addEventListener("change", (state) => {
      for (const s of sessions.current.values()) {
        if (state === "active") s.start();
        else s.stop();
      }
    });
    return () => sub.remove();
  }, [reload]);

  const value = useMemo<HostsValue>(() => ({ hosts, loaded, registry, session: (id) => sessions.current.get(id) ?? null, reload }), [hosts, loaded, registry, reload]);
  return <HostsContext.Provider value={value}>{children}</HostsContext.Provider>;
}

export function useHosts(): HostsValue {
  const value = useContext(HostsContext);
  if (!value) throw new Error("HostsProvider の外です");
  return value;
}

/** その本体のつながりと、つながりの様子（変わったら描き直す） */
export function useHostSession(hostId: string): { session: HostSession | null; state: SessionState } {
  const { session: get, hosts } = useHosts();
  const session = useMemo(() => get(hostId), [get, hostId, hosts]);
  const [state, setState] = useState<SessionState>(session?.state ?? { kind: "stopped" });
  useEffect(() => {
    if (!session) return;
    setState(session.state);
    return session.onState(setState);
  }, [session]);
  return { session, state };
}
