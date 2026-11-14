// 本体をつなぐ: Mac の画面の QR を読む（読めなければ URL と番号を打つ）→ 本体に頼む → Mac の画面で「つなぐ」を押すのを待つ →
// 端末のトークンを受け取って保管庫（Keystore）に置く
import { useEffect, useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Device from "expo-device";
import type { PairingClaimResult } from "@shared/types";
import { HostClient } from "../lib/client";
import { hostNameOf } from "../lib/hosts";
import { claimPairing, normalizeHostUrl, parsePairingLink, pollPairing, type PairingTarget } from "../lib/pairing";
import { useHosts } from "../state/hosts";
import { Button } from "../ui/Button";
import { ui } from "../ui/theme";

const POLL_MS = 2_000;

type Step = { kind: "scan" } | { kind: "waiting"; target: PairingTarget; claim: PairingClaimResult } | { kind: "done" };

export default function PairScreen() {
  const router = useRouter();
  const { registry, reload } = useHosts();
  const [permission, requestPermission] = useCameraPermissions();
  const [step, setStep] = useState<Step>({ kind: "scan" });
  const [error, setError] = useState<string | null>(null);
  const [manualUrl, setManualUrl] = useState("");
  const [manualCode, setManualCode] = useState("");
  const scanned = useRef(false);

  const claim = async (target: PairingTarget) => {
    setError(null);
    try {
      const name = Device.deviceName ?? Device.modelName ?? "Android";
      setStep({ kind: "waiting", target, claim: await claimPairing(target, name) });
    } catch (e) {
      scanned.current = false;
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  // Mac の画面で答えるまで、少しずつ聞く
  useEffect(() => {
    if (step.kind !== "waiting") return;
    let alive = true;
    const tick = async () => {
      try {
        const result = await pollPairing(step.target.url, step.claim);
        if (!alive) return;
        if (result.status === "pending") return void setTimeout(() => alive && void tick(), POLL_MS);
        if (result.status === "approved") {
          // できること（使える / 見るだけ）は Mac の画面で選んだもの
          const self = await new HostClient({ url: step.target.url, token: result.token }).self().catch(() => null);
          await registry.add(
            { host_id: result.host_id, url: step.target.url, name: hostNameOf(step.target.url), device_id: result.device_id, access: self?.access ?? "full", paired_at: new Date().toISOString() },
            result.token,
          );
          await reload();
          setStep({ kind: "done" });
          router.replace(`/${encodeURIComponent(result.host_id)}`);
          return;
        }
        scanned.current = false;
        setStep({ kind: "scan" });
        setError(result.status === "denied" ? "Mac の画面で断られました" : "期限が切れました。Mac の画面で番号を出し直してください");
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      }
    };
    void tick();
    return () => {
      alive = false;
    };
  }, [step, registry, reload, router]);

  if (step.kind === "waiting") {
    return (
      <View style={[ui.screen, ui.pad]}>
        <Text style={ui.title}>Mac の画面で「つなぐ」を押してください</Text>
        <Text style={ui.muted}>Mac の Kickoff の設定の「スマホ連携」に「この端末をつなぎますか」が出ています。</Text>
        {error && <Text style={ui.error}>{error}</Text>}
        <Button label="やめる" onPress={() => setStep({ kind: "scan" })} />
      </View>
    );
  }

  const manual = () => {
    const url = normalizeHostUrl(manualUrl);
    const code = manualCode.replace(/\D/g, "");
    if (!url) return setError("つなぐ先の URL は https:// の URL を入れてください（Tailscale Serve の https://<Mac の名前>.ts.net）");
    if (code.length !== 6) return setError("番号は 6 桁です");
    void claim({ url, code, host_id: null });
  };

  return (
    <View style={[ui.screen, ui.pad]}>
      <Text style={ui.muted}>Mac の Kickoff の設定の「スマホ連携」で「端末をつなぐ」を押し、出た QR を読みます。</Text>
      {permission?.granted ? (
        <View style={{ height: 280, borderRadius: 12, overflow: "hidden" }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={
              scanned.current
                ? undefined
                : ({ data }) => {
                    // 同じ QR を続けて読んでも、頼むのは 1 回だけ
                    if (scanned.current) return;
                    const target = parsePairingLink(data);
                    if (!target) return setError("Kickoff の QR ではありません");
                    scanned.current = true;
                    void claim(target);
                  }
            }
          />
        </View>
      ) : (
        <Button primary label="カメラを使う" onPress={() => void requestPermission()} />
      )}
      {error && <Text style={ui.error}>{error}</Text>}
      <Text style={[ui.muted, { marginTop: 8 }]}>読めないときは、つなぐ先の URL と番号を打ちます。</Text>
      <TextInput style={ui.input} placeholder="https://mac.tailnet.ts.net" placeholderTextColor="#666" autoCapitalize="none" autoCorrect={false} keyboardType="url" value={manualUrl} onChangeText={setManualUrl} />
      <TextInput style={ui.input} placeholder="番号（6 桁）" placeholderTextColor="#666" keyboardType="number-pad" value={manualCode} onChangeText={setManualCode} />
      <Button label="この番号でつなぐ" onPress={manual} />
    </View>
  );
}
