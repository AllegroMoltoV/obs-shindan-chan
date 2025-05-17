import React, { useEffect, useState } from "react";
import ProfileSelector from "./components/ProfileSelector";
import * as ini from "ini";
import rules from "./assets/rules.json";


import okImg from './assets/ok.png';
import warnImg from './assets/warn.png';
import ngImg from './assets/ng.png';

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

    const diagnoseBitrate = (): [string, boolean] => {
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

        if (!entry) return [`ビットレート：${bitrate} kbps → 判定不可！縦横サイズの数値が特殊かも？`, false];
        if (bitrate < entry.min) return [`ビットレート：${bitrate} kbps → ${rules.comment.low}`, true];
        if (bitrate > entry.max) return [`ビットレート：${bitrate} kbps → ${rules.comment.high}`, true];
        return [`ビットレート：${bitrate} kbps → ${rules.comment.ok}`, false];
    };

    const diagnoseRateControl = (): [string, boolean] => {
        const mode = getOutputMode(iniData);
        if (mode === "Simple") {
            return ["レート制御：CBR（固定） → 基本モードでは固定だよ！", false];
        }
        const rc = encoderJson?.rate_control?.toUpperCase() ?? "CBR";
        return rc === "CBR"
            ? [`レート制御：${rc} → ${rules.encoding.comment.ok}`, false]
            : [`レート制御：${rc} → ${rules.encoding.comment.warn}`, true];
    };

    const diagnoseKeyframe = (): [string, boolean] => {
        const mode = getOutputMode(iniData);
        if (mode === "Simple") return ["キーフレーム：基本モードでは固定だよ！", false];
        const keyInt = encoderJson?.keyint_sec ?? Number(iniData?.AdvOut?.KeyIntSec ?? 0);
        if (keyInt === 0) {
            return [`キーフレーム間隔：自動 → ${rules.keyframeInterval.comment.ok}`, false];
        } else if (keyInt === rules.keyframeInterval.expectedSeconds) {
            return [`キーフレーム間隔：${keyInt} 秒 → ${rules.keyframeInterval.comment.ok}`, false];
        }
        return [`キーフレーム間隔：${keyInt} 秒 → ${rules.keyframeInterval.comment.warn}`, true];
    };

    const diagnoseProfile = (): [string, boolean] => {
        const mode = getOutputMode(iniData);
        if (mode === "Simple") return ["プロファイル：基本モードでは固定だよ！", false];
        const profile = encoderJson?.profile ?? "default";
        const matched = rules.profile.allowed.includes(profile.toLowerCase());
        return matched
            ? [`プロファイル：${profile} → ${rules.profile.comment.ok}`, false]
            : [`プロファイル：${profile} → ${rules.profile.comment.warn}`, true];
    };

    const diagnoseSampleRate = (): [string, boolean] => {
        const rate = Number(iniData?.Audio?.SampleRate ?? 0);
        return rate === rules.sampleRate.expected
            ? [`サンプルレート：${rate} Hz → ${rules.sampleRate.comment.ok}`, false]
            : [`サンプルレート：${rate} Hz → ${rules.sampleRate.comment.warn}`, true];
    };

    const diagnosePingStats = (ping: number | null, loss: number | null): [string, boolean] => {
        if (ping === null) {
            return ["ping 応答：測定できませんでした。環境を確認してみて！", false];
        }

        let msg = `ping 応答時間：${ping} ms`;
        let flag = false;
        if (ping > 100) {
            msg += " → やや高め。配信中に遅延が出るかも";
            flag = true;
        }
        else {
            msg += " → 問題なし！";
        }
        if (loss !== null && loss > 0) {
            msg += `／パケットロス：${loss}% → 通信不安定の可能性`;
            flag = true;
        }
        return [msg, flag];
    };

    const diagnoseConnectionType = (type: string): [string, boolean] => {
        if (type === "Wi-Fi") {
            return [`接続種別：${type} → 可能なら有線推奨！`, true];
        } else {
            return [`接続種別：${type} → 問題なし！`, false];
        }
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
                    <li>{diagnosePingStats(networkDiag.ping.avgPing, networkDiag.ping.loss)[0]}</li>
                    <li>{diagnoseConnectionType(networkDiag.type)[0]}</li>
                </ul>
            </div>
        );
    };

    const getCharacterImage = (): string => {
        if (!iniData) return ngImg;

        const results = [
            diagnoseBitrate(),
            diagnoseRateControl(),
            diagnoseKeyframe(),
            diagnoseProfile(),
            diagnoseSampleRate()
        ];

        const warnCount = results.filter(([, isWarn]) => isWarn).length;

        if (warnCount >= 3) return ngImg;
        if (warnCount >= 1) return warnImg;
        return okImg;
    };

    const getBitrates = (): [number, number, number] | null => {
        const width = Number(iniData?.Video?.BaseCX);
        const height = Number(iniData?.Video?.BaseCY);
        const fps = getFps(iniData);

        const entry = rules.bitrateRecommendations.find(
            (r: any) => r.width === width && r.height === height && r.fps === fps
        );

        return entry ? [entry.recommended, entry.min, entry.max] : null;
    };

    const bitrates = getBitrates();

    return (
        <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
            <h1>
                <img
                src={getCharacterImage()}
                alt="診断ちゃんの表情"
                width={128}
                height={128}
                style={{ borderRadius: "50%", boxShadow: "0 0 10px rgba(0,0,0,0.2)" }}
                />
                OBS診断ちゃん
            </h1>
            <p>「きょうも、ちゃんと診てあげるから……安心してね？」</p>

            <ProfileSelector
                onProfileSelect={(name) => setSelectedProfile(name)}
                onProfilesLoaded={(profiles) => setHasProfiles(profiles.length > 0)}
            />

            {!selectedProfile && (
                <p style={{ color: "red" }}>OBS を一度も起動していないか、プロファイルが削除されてるかも？</p>
            )}

            {selectedProfile && iniData === null && (
                <p style={{ color: "red" }}>
                    このプロファイルには `basic.ini` が存在しないか、読み込みに失敗しました。<br />
                    OBS を一度起動してプロファイルを初期化してください。
                </p>
            )}

            {selectedProfile && iniData && (
                <div style={{ marginTop: "2rem" }}>
                    <h2>診断結果</h2>

                    <p><strong>現在の設定：</strong>
                        解像度 {iniData?.Video?.BaseCX}×{iniData?.Video?.BaseCY} ／
                        {getFps(iniData)} fps
                    </p>

                    {bitrates !== null ? (
                        <p><strong>おすすめビットレート：</strong> {bitrates[0]} kbps (最小: {bitrates[1]} kbps - 最大: {bitrates[2]} kbps)</p>
                    ) : (
                        <p><strong>おすすめビットレート：</strong> 対応表に該当なし</p>
                    )}

                    <p><strong>出力モード:</strong> {getOutputModeString(iniData)}</p>
                    <ul>
                        <li>{diagnoseBitrate()[0]}</li>
                        <li>{diagnoseRateControl()[0]}</li>
                        <li>{diagnoseKeyframe()[0]}</li>
                        <li>{diagnoseProfile()[0]}</li>
                        <li>{diagnoseSampleRate()[0]}</li>
                    </ul>
                    {renderNetworkDiag()}
                </div>
            )}
        </div>
    );
}
