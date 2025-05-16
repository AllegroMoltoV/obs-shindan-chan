import React, {useEffect, useState} from "react";
import ProfileSelector from "./components/ProfileSelector";
import * as ini from "ini";
import rules from "./assets/rules.json";

export default function App() {
    const [selectedProfile, setSelectedProfile] = useState<string>("");
    const [iniData, setIniData] = useState<any | null>(null);
    const [encoderJson, setEncoderJson] = useState<any>({}); // 初期値は空オブジェクト

    useEffect(() => {
        if (!selectedProfile) return;

        const load = () => {
            window.electronAPI.readBasicINI(selectedProfile).then((text) => {
                setIniData(ini.parse(text));
            });

            window.electronAPI.readEncoderJSON(selectedProfile).then((data) => {
                setEncoderJson(data ?? {}); // ファイルがない場合でも空オブジェクトで処理継続
            });
        };

        load();
        window.electronAPI.watchProfileFiles(selectedProfile);

        const handleUpdate = (_: any, filename: string) => {
            console.log(`${filename} が更新されました。再読み込みします。`);
            load();
        };

        window.electronAPI.onProfileFileUpdated(handleUpdate);

        return () => {
            // クリーンアップ: リスナー解除など
        };
    }, [selectedProfile]);


    const getOutputMode = (ini: any): string => ini?.Output?.Mode ?? "Unknown";
    const getOutputModeString = (ini: any): string => {
        switch (getOutputMode(ini)) {
            case "Simple":
                return "基本";
            case "Advanced":
                return "詳細";
            default:
                return "不明";
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
        const crf = encoderJson?.crf;

        if (rc === "CBR") {
            return `レート制御：${rc} → ${rules.encoding.comment.ok}`;
        } else {
            return `レート制御：${rc} → ${rules.encoding.comment.warn}`;
        }
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

    return (
        <div style={{padding: "2rem", fontFamily: "sans-serif"}}>
            <h1>OBS診断ちゃん</h1>
            <p>「きょうも、ちゃんと診てあげるから……安心してね？」</p>

            <ProfileSelector onProfileSelect={(name) => setSelectedProfile(name)}/>
            <p><strong>選択されたプロファイル:</strong> {selectedProfile}</p>

            {iniData && (
                <div style={{marginTop: "2rem"}}>
                    <h2>診断結果</h2>
                    <p><strong>出力モード:</strong> {getOutputModeString(iniData)}</p>
                    <ul>
                        <li>{diagnoseBitrate()}</li>
                        <li>{diagnoseRateControl()}</li>
                        <li>{diagnoseKeyframe()}</li>
                        <li>{diagnoseProfile()}</li>
                        <li>{diagnoseSampleRate()}</li>
                    </ul>
                </div>
            )}
        </div>
    );
}
