import React, { useEffect, useState } from "react";
import ProfileSelector from "./components/ProfileSelector";
import * as ini from "ini";
import rules from "./assets/rules.json";

export default function App() {
    const [selectedProfile, setSelectedProfile] = useState<string>("");
    const [iniData, setIniData] = useState<any | null>(null);
    const [encoderJson, setEncoderJson] = useState<any>({});
    const [hasProfiles, setHasProfiles] = useState<boolean | null>(null);
    const [networkDiag, setNetworkDiag] = useState<null | {
        ping: { avgPing: number | null; loss: number | null };
        type: string;
    }>(null);
    const [isNetworkDiagLoading, setIsNetworkDiagLoading] = useState(false);

    const isObject = (val: any): val is Record<string, any> =>
        val !== null && typeof val === "object" && !Array.isArray(val);

    const isValid = (val: any): boolean =>
        val !== undefined && val !== null && val !== 0 && val !== "";

    function mergeDefaults(defaults: Record<string, any>, source: Record<string, any>) {
        const result: Record<string, any> = {};
        const keys = new Set<string>([...Object.keys(defaults), ...Object.keys(source)]);
        for (const key of keys) {
            const defVal = defaults[key];
            const srcVal = source[key];
            if (isObject(defVal) && isObject(srcVal)) {
                result[key] = mergeDefaults(defVal, srcVal);
            } else {
                result[key] = isValid(srcVal) ? srcVal : defVal;
            }
        }
        return result;
    }

    function applyDefaults(parsedIni: Record<string, any>) {
        const defaults = {
            Output: { Mode: "Simple" },
            Video: {
                BaseCX: 1920,
                BaseCY: 1080,
                FPSNum: 30,
                FPSDen: 1,
            },
            Audio: {
                SampleRate: 48000,
            },
            SimpleOutput: {
                VBitrate: 2500,
            },
            AdvOut: {
                FFVBitrate: 2500,
                KeyIntSec: 0,
            },
        };
        return mergeDefaults(defaults, parsedIni);
    }

    useEffect(() => {
        if (!selectedProfile) return;

        const load = () => {
            window.electronAPI.readBasicINI(selectedProfile)
                .then((text) => {
                    const parsed = ini.parse(text);
                    const withDefaults = applyDefaults(parsed);
                    setIniData(withDefaults);
                })
                .catch((err) => {
                    console.error("INI 読み込み失敗:", err);
                    setIniData(null);
                });

            window.electronAPI.readEncoderJSON(selectedProfile).then((data) => {
                setEncoderJson(data ?? {});
            });
        };

        load();
        window.electronAPI.watchProfileFiles(selectedProfile);

        const handleUpdate = (_: any, filename: string) => {
            console.log(`${filename} が更新されました。再読み込みします。`);
            load();
        };

        window.electronAPI.onProfileFileUpdated(handleUpdate);

        return () => { };
    }, [selectedProfile]);

    useEffect(() => {
        if (!selectedProfile || !iniData) return;

        const runNetworkDiagnostics = async () => {
            setIsNetworkDiagLoading(true);
            try {
                const [ping, net] = await Promise.all([
                    window.electronAPI.getPingStats(),
                    window.electronAPI.getNetworkType(),
                ]);
                setNetworkDiag({ ping, type: net.type });
            } catch (err) {
                console.error("Network diagnostics failed:", err);
                setNetworkDiag(null);
            } finally {
                setIsNetworkDiagLoading(false);
            }
        };

        runNetworkDiagnostics();
    }, [selectedProfile, iniData]);

    const getOutputMode = (ini: any): string => ini?.Output?.Mode ?? "Unknown";
    const getOutputModeString = (ini: any): string => {
        switch (getOutputMode(ini)) {
            case "Simple": return "基本";
            case "Advanced": return "詳細";
            default: return "不明";
        }
    };
    const getFps = (ini: any): number => {
        const num = Number(ini?.Video?.FPSNum ?? 0);
        const den = Number(ini?.Video?.FPSDen ?? 1);
        return den === 0 ? 0 : Math.round((num / den) * 100) / 100;
    };

    const diagnoseBitrate = (): string => {
        const mode = getOutputMode(iniData);
        const width = Number(iniData?.Video?.BaseCX);
        const height = Number(iniData?.Video?.BaseCY);
        const fps = getFps(iniData);
        const bitrate = mode === "Simple"
            ? Number(iniData?.SimpleOutput?.VBitrate ?? 0)
            : Number(encoderJson.bitrate ?? 2500);
        const entry = rules.bitrateRecommendations.find(
            (r: any) => r.width === width && r.height === height && r.fps === fps
        );
        if (!entry) return `ビットレート：${bitrate} kbps → 基準が見つかりません`;
        if (bitrate < entry.min) return `ビットレート：${bitrate} kbps → ${rules.comment.low}`;
        if (bitrate > entry.max) return `ビットレート：${bitrate} kbps → ${rules.comment.high}`;
        return `ビットレート：${bitrate} kbps → ${rules.comment.ok}`;
    };

    const diagnoseRateControl = (): string => {
        const mode = getOutputMode(iniData);
        if (mode === "Simple") return "レート制御：CBR（固定） → 基本モードでは固定だよ！";
        const rc = encoderJson?.rate_control?.toUpperCase() ?? "CBR";
        return rc === "CBR"
            ? `レート制御：${rc} → ${rules.encoding.comment.ok}`
            : `レート制御：${rc} → ${rules.encoding.comment.warn}`;
    };

    const diagnoseKeyframe = (): string => {
        const mode = getOutputMode(iniData);
        if (mode === "Simple") return "キーフレーム：基本モードでは固定だよ！";
        const keyInt = encoderJson?.keyint_sec ?? Number(iniData?.AdvOut?.KeyIntSec ?? 0);
        if (keyInt === 0) {
            return `キーフレーム間隔：自動 → ${rules.keyframeInterval.comment.ok}`;
        } else if (keyInt === rules.keyframeInterval.expectedSeconds) {
            return `キーフレーム間隔：${keyInt} 秒 → ${rules.keyframeInterval.comment.ok}`;
        }
        return `キーフレーム間隔：${keyInt} 秒 → ${rules.keyframeInterval.comment.warn}`;
    };

    const diagnoseProfile = (): string => {
        const mode = getOutputMode(iniData);
        if (mode === "Simple") return "プロファイル：基本モードでは固定だよ！";
        const profile = encoderJson?.profile ?? "default";
        const matched = rules.profile.allowed.includes(profile.toLowerCase());
        return matched
            ? `プロファイル：${profile} → ${rules.profile.comment.ok}`
            : `プロファイル：${profile} → ${rules.profile.comment.warn}`;
    };

    const diagnoseSampleRate = (): string => {
        const rate = Number(iniData?.Audio?.SampleRate ?? 0);
        return rate === rules.sampleRate.expected
            ? `サンプルレート：${rate} Hz → ${rules.sampleRate.comment.ok}`
            : `サンプルレート：${rate} Hz → ${rules.sampleRate.comment.warn}`;
    };

    const diagnosePingStats = (ping: number | null, loss: number | null): string => {
        if (ping === null) return "ping 応答：測定できませんでした。環境を確認してみて！";
        let msg = `ping 応答時間：${ping} ms`;
        if (ping > 100) msg += " → やや高め。配信中に遅延が出るかも";
        else msg += " → 問題なし";
        if (loss !== null && loss > 0) msg += `／パケットロス：${loss}% → 通信不安定の可能性`;
        return msg;
    };

    const diagnoseConnectionType = (type: string): string => {
        return `接続種別：${type} → ${type === "Wi-Fi" ? "可能なら有線推奨！" : "問題なし"}`;
    };

    const renderNetworkDiag = () => {
        if (isNetworkDiagLoading) {
            return (
                <div style={{ marginTop: "1rem" }}>
                    <h3>ネットワーク診断</h3>
                    <p>ネットワークを診断中です…少しだけ待ってね。</p>
                </div>
            );
        }

        if (!networkDiag) return null;

        return (
            <div style={{ marginTop: "1rem" }}>
                <h3>ネットワーク診断</h3>
                <ul>
                    <li>{diagnosePingStats(networkDiag.ping.avgPing, networkDiag.ping.loss)}</li>
                    <li>{diagnoseConnectionType(networkDiag.type)}</li>
                </ul>
            </div>
        );
    };

    return (
        <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
            <h1>OBS診断ちゃん</h1>
            <p>「きょうも、ちゃんと診てあげるから……安心してね？」</p>

            <ProfileSelector
                onProfileSelect={(name) => setSelectedProfile(name)}
                onProfilesLoaded={(profiles) => setHasProfiles(profiles.length > 0)}
            />

            {!selectedProfile && (
                <p style={{ color: "red" }}>OBS を一度も起動していないか、プロファイルが削除されてるかも？</p>
            )}

            {selectedProfile && iniData && (
                <div style={{ marginTop: "2rem" }}>
                    <h2>診断結果</h2>
                    <p><strong>出力モード:</strong> {getOutputModeString(iniData)}</p>
                    <ul>
                        <li>{diagnoseBitrate()}</li>
                        <li>{diagnoseRateControl()}</li>
                        <li>{diagnoseKeyframe()}</li>
                        <li>{diagnoseProfile()}</li>
                        <li>{diagnoseSampleRate()}</li>
                    </ul>
                    {renderNetworkDiag()}
                </div>
            )}
        </div>
    );
}
