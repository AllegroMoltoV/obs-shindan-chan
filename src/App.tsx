import React, { useEffect, useState } from 'react';
import * as ini from 'ini';
import ProfileSelector from './components/ProfileSelector';
import Update from './components/update';
import {
  PLATFORM_RULES,
  type AudioChannelType,
  type PlatformKey,
} from './assets/platformRules';

import okImg from './assets/ok.png';
import warnImg from './assets/warn.png';
import ngImg from './assets/ng.png';
import './App.css';
import packageJson from '../package.json';

type IniData = Record<string, any> | null;

type NetworkDiag = {
  ping: { avgPing: number | null; loss: number | null };
  type: string;
};

const isObject = (value: unknown): value is Record<string, any> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isValid = (value: unknown): boolean =>
  value !== undefined && value !== null && value !== '';

function mergeDefaults(defaults: Record<string, any>, source: Record<string, any>) {
  const result: Record<string, any> = {};
  const keys = new Set<string>([...Object.keys(defaults), ...Object.keys(source)]);

  for (const key of keys) {
    const defaultValue = defaults[key];
    const sourceValue = source[key];

    if (isObject(defaultValue) && isObject(sourceValue)) {
      result[key] = mergeDefaults(defaultValue, sourceValue);
      continue;
    }

    result[key] = isValid(sourceValue) ? sourceValue : defaultValue;
  }

  return result;
}

function applyDefaults(parsedIni: Record<string, any>) {
  const defaults = {
    Output: { Mode: 'Simple' },
    Video: {
      OutputCX: 1280,
      OutputCY: 720,
      FPSType: 0,
      FPSCommon: 30,
      FPSInt: 30,
      FPSNum: 30,
      FPSDen: 1,
    },
    Audio: {
      SampleRate: 48000,
      ChannelSetup: 'Stereo',
    },
    SimpleOutput: {
      VBitrate: 2500,
      ABitrate: 128,
    },
    AdvOut: {
      Track1Bitrate: 160,
      FFVBitrate: 2500,
      KeyIntSec: 0,
    },
  };

  return mergeDefaults(defaults, parsedIni);
}

function extractNumericPrefix(value: unknown): number {
  if (value === undefined || value === null) {
    return NaN;
  }

  const match = String(value).match(/^(\d+(\.\d+)?)/);
  return match ? Number(match[0]) : NaN;
}

function getFps(iniData: IniData): number {
  const fpsType = Number(iniData?.Video?.FPSType);

  if (fpsType === 0) {
    return extractNumericPrefix(iniData?.Video?.FPSCommon);
  }

  if (fpsType === 1) {
    return Number(iniData?.Video?.FPSInt);
  }

  return Number(iniData?.Video?.FPSNum) / Number(iniData?.Video?.FPSDen);
}

function getOutputMode(iniData: IniData): string {
  return iniData?.Output?.Mode ?? 'Unknown';
}

function getOutputModeLabel(iniData: IniData): string {
  switch (getOutputMode(iniData)) {
    case 'Simple':
      return '基本';
    case 'Advanced':
      return '詳細';
    default:
      return '不明';
  }
}

function getAudioChannelType(iniData: IniData): AudioChannelType {
  const raw = iniData?.Audio?.ChannelSetup?.toLowerCase() ?? '';

  if (raw.includes('5.1') || raw.includes('7.1')) {
    return 'surround';
  }

  if (raw.includes('stereo')) {
    return 'stereo';
  }

  return 'other';
}

function getCurrentVideoBitrate(iniData: IniData, encoderJson: Record<string, any>) {
  return getOutputMode(iniData) === 'Simple'
    ? Number(iniData?.SimpleOutput?.VBitrate ?? 0)
    : Number(encoderJson.bitrate ?? iniData?.AdvOut?.FFVBitrate ?? 2500);
}

function formatSampleRates(sampleRates: number[]) {
  return sampleRates.map((rate) => `${rate / 1000}kHz`).join(' / ');
}

export default function App() {
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformKey | null>(null);
  const [selectedProfile, setSelectedProfile] = useState('');
  const [iniData, setIniData] = useState<IniData>(null);
  const [encoderJson, setEncoderJson] = useState<Record<string, any>>({});
  const [networkDiag, setNetworkDiag] = useState<NetworkDiag | null>(null);
  const [isNetworkDiagLoading, setIsNetworkDiagLoading] = useState(false);

  const activeRules = selectedPlatform ? PLATFORM_RULES[selectedPlatform] : null;
  const appVersion = packageJson.version;

  useEffect(() => {
    if (!selectedProfile) {
      return;
    }

    const load = () => {
      window.electronAPI.readBasicINI(selectedProfile)
        .then((text) => {
          const parsed = ini.parse(text);
          setIniData(applyDefaults(parsed));
        })
        .catch((error) => {
          console.error('INI 読み込み失敗:', error);
          setIniData(null);
        });

      window.electronAPI.readEncoderJSON(selectedProfile)
        .then((data) => {
          setEncoderJson(data ?? {});
        })
        .catch((error) => {
          console.error('streamEncoder.json 読み込み失敗:', error);
          setEncoderJson({});
        });
    };

    load();
    window.electronAPI.watchProfileFiles(selectedProfile);

    const handleUpdate = (_event: any, filename: string) => {
      console.log(`${filename} が更新されました。再読み込みします。`);
      load();
    };

    window.electronAPI.onProfileFileUpdated(handleUpdate);
  }, [selectedProfile]);

  useEffect(() => {
    if (!selectedProfile || !iniData) {
      return;
    }

    const runNetworkDiagnostics = async () => {
      setIsNetworkDiagLoading(true);

      try {
        const [ping, network] = await Promise.all([
          window.electronAPI.getPingStats(),
          window.electronAPI.getNetworkType(),
        ]);

        setNetworkDiag({ ping, type: network.type });
      } catch (error) {
        console.error('Network diagnostics failed:', error);
        setNetworkDiag(null);
      } finally {
        setIsNetworkDiagLoading(false);
      }
    };

    runNetworkDiagnostics();
  }, [selectedProfile, iniData]);

  const diagnoseBitrate = (): [string, boolean] => {
    if (!activeRules || !iniData) {
      return ['映像ビットレート：これから見るね。', false];
    }

    const bitrate = getCurrentVideoBitrate(iniData, encoderJson);
    const width = Number(iniData?.Video?.OutputCX);
    const height = Number(iniData?.Video?.OutputCY);
    const fps = getFps(iniData);

    if (activeRules.bitrate.mode === 'table') {
      const entry = activeRules.bitrate.recommendations.find(
        (rule) => rule.width === width && rule.height === height && rule.fps === fps,
      );

      if (!entry) {
        return [`映像ビットレート：${bitrate} kbps → ${activeRules.bitrate.comment.unavailable}`, false];
      }

      if (bitrate < entry.min) {
        return [`映像ビットレート：${bitrate} kbps → ${activeRules.bitrate.comment.low}`, true];
      }

      if (bitrate > entry.max) {
        return [`映像ビットレート：${bitrate} kbps → ${activeRules.bitrate.comment.high}`, true];
      }

      return [`映像ビットレート：${bitrate} kbps → ${activeRules.bitrate.comment.ok}`, false];
    }

    if (bitrate > activeRules.bitrate.max) {
      return [`映像ビットレート：${bitrate} kbps → ${activeRules.bitrate.comment.high}`, true];
    }

    return [`映像ビットレート：${bitrate} kbps → ${activeRules.bitrate.comment.ok}`, false];
  };

  const diagnoseRateControl = (): [string, boolean] => {
    if (!activeRules || !iniData) {
      return ['レート制御：これから見るね。', false];
    }

    if (getOutputMode(iniData) === 'Simple') {
      return ['レート制御：CBR（この設定では OBS におまかせで大丈夫）', false];
    }

    const rateControl = encoderJson?.rate_control?.toUpperCase() ?? 'CBR';

    return rateControl === 'CBR'
      ? [`レート制御：${rateControl} → ${activeRules.encoding.comment.ok}`, false]
      : [`レート制御：${rateControl} → ${activeRules.encoding.comment.warn}`, true];
  };

  const diagnoseKeyframe = (): [string, boolean] => {
    if (!activeRules || !iniData) {
      return ['キーフレーム：これから見るね。', false];
    }

    if (getOutputMode(iniData) === 'Simple') {
      return ['キーフレーム：この設定では OBS におまかせで大丈夫。', false];
    }

    const keyInt = Number(encoderJson?.keyint_sec ?? iniData?.AdvOut?.KeyIntSec ?? 0);

    if (keyInt === 0 || keyInt === activeRules.keyframeInterval.expectedSeconds) {
      return [`キーフレーム間隔：${keyInt === 0 ? '自動' : `${keyInt} 秒`} → ${activeRules.keyframeInterval.comment.ok}`, false];
    }

    return [`キーフレーム間隔：${keyInt} 秒 → ${activeRules.keyframeInterval.comment.warn}`, true];
  };

  const diagnoseProfile = (): [string, boolean] => {
    if (!activeRules || !iniData) {
      return ['画質の細かい設定：これから見るね。', false];
    }

    if (getOutputMode(iniData) === 'Simple') {
      return ['画質の細かい設定：この設定では OBS におまかせで大丈夫。', false];
    }

    const profile = String(encoderJson?.profile ?? 'default').toLowerCase();
    const matched = activeRules.profile.allowed.includes(profile);

    return matched
      ? [`画質の細かい設定：${profile} → ${activeRules.profile.comment.ok}`, false]
      : [`画質の細かい設定：${profile} → ${activeRules.profile.comment.warn}`, true];
  };

  const diagnoseSampleRate = (): [string, boolean] => {
    if (!activeRules || !iniData) {
      return ['音のきめ細かさ：これから見るね。', false];
    }

    const rate = Number(iniData?.Audio?.SampleRate ?? 0);
    const channelType = getAudioChannelType(iniData);
    const rule = activeRules.audio[channelType];
    const matched = rule.sampleRates.includes(rate);

    return matched
      ? [`音のきめ細かさ：${rate} Hz → ここはよさそう。(${formatSampleRates(rule.sampleRates)})`, false]
      : [`音のきめ細かさ：${rate} Hz → ${rule.comment.sampleRate}`, true];
  };

  const diagnoseAudioBitrate = (): [string, boolean] => {
    if (!activeRules || !iniData) {
      return ['音の情報量：これから見るね。', false];
    }

    const channelType = getAudioChannelType(iniData);
    const rule = activeRules.audio[channelType];
    const actualBitrate = getOutputMode(iniData) === 'Simple'
      ? Number(iniData?.SimpleOutput?.ABitrate ?? 0)
      : Number(iniData?.AdvOut?.Track1Bitrate ?? 0);

    if (rule.bitrate.exact !== undefined) {
      return actualBitrate === rule.bitrate.exact
        ? [`音の情報量：${actualBitrate} kbps → ここはいい感じ。`, false]
        : [`音の情報量：${actualBitrate} kbps → ${rule.comment.bitrate}`, true];
    }

    const min = rule.bitrate.min ?? 0;
    const max = rule.bitrate.max ?? Number.MAX_SAFE_INTEGER;
    const matched = actualBitrate >= min && actualBitrate <= max;

    return matched
      ? [`音の情報量：${actualBitrate} kbps → ここはちょうどよさそう。`, false]
      : [`音の情報量：${actualBitrate} kbps → ${rule.comment.bitrate}`, true];
  };

  const diagnosePingStats = (ping: number | null, loss: number | null): [string, boolean] => {
    if (ping === null) {
      return ['通信の反応：うまく測れなかったよ。ネット回りを見てみてね。', false];
    }

    let message = `ping 応答時間：${ping} ms`;
    let isWarn = false;

    if (ping > 100) {
      message += ' → 少し反応がゆっくりめかも。配信に響くかもしれないね。';
      isWarn = true;
    } else {
      message += ' → ここは大丈夫そう。';
    }

    if (loss !== null && loss > 0) {
      message += ` パケットロス：${loss}%`;
      isWarn = true;
    }

    return [message, isWarn];
  };

  const diagnoseConnectionType = (type: string): [string, boolean] => {
    if (type === 'Wi-Fi') {
      return [`つなぎ方：${type} → できれば有線にすると、もっと安心だよ。`, true];
    }

    return [`つなぎ方：${type} → ここは大丈夫そう。`, false];
  };

  const renderNetworkDiagnostics = () => {
    if (isNetworkDiagLoading) {
      return (
        <section className="diagnosis-card">
          <h3>ネットワーク診断</h3>
          <p>ネットワークを診断しています。少しだけ待ってください。</p>
        </section>
      );
    }

    if (!networkDiag) {
      return null;
    }

    return (
      <section className="diagnosis-card">
        <h3>ネットワーク診断</h3>
        <ul className="diagnosis-list">
          <li>{diagnosePingStats(networkDiag.ping.avgPing, networkDiag.ping.loss)[0]}</li>
          <li>{diagnoseConnectionType(networkDiag.type)[0]}</li>
        </ul>
      </section>
    );
  };

  const getCharacterImage = (): string => {
    if (!iniData || !activeRules) {
      return okImg;
    }

    const results = [
      diagnoseBitrate(),
      diagnoseRateControl(),
      diagnoseKeyframe(),
      diagnoseProfile(),
      diagnoseSampleRate(),
      diagnoseAudioBitrate(),
    ];

    const warnCount = results.filter(([, isWarn]) => isWarn).length;

    if (warnCount >= 3) {
      return ngImg;
    }

    if (warnCount >= 1) {
      return warnImg;
    }

    return okImg;
  };

  const renderRecommendedSettings = () => {
    if (!activeRules || !iniData) {
      return null;
    }

    const width = Number(iniData?.Video?.OutputCX);
    const height = Number(iniData?.Video?.OutputCY);
    const fps = getFps(iniData);
    const channelType = getAudioChannelType(iniData);
    const audioRule = activeRules.audio[channelType];

    let videoMessage = activeRules.bitrate.mode === 'table'
      ? '対応表に該当なし'
      : activeRules.bitrate.recommended;

    if (activeRules.bitrate.mode === 'table') {
      const entry = activeRules.bitrate.recommendations.find(
        (rule) => rule.width === width && rule.height === height && rule.fps === fps,
      );

      if (entry) {
        videoMessage = `${entry.recommended} kbps (最小 ${entry.min} / 最大 ${entry.max})`;
      }
    }

    const audioBitrateMessage = audioRule.bitrate.exact !== undefined
      ? `${audioRule.bitrate.exact} kbps`
      : `${audioRule.bitrate.recommended} kbps を目安 (${audioRule.bitrate.min} - ${audioRule.bitrate.max} kbps)`;

    return (
      <section className="diagnosis-card">
        <h3>おすすめ設定の目安</h3>
        <ul className="diagnosis-list">
          <li><strong>映像ビットレート:</strong> {videoMessage}</li>
          <li><strong>音のきめ細かさ:</strong> {formatSampleRates(audioRule.sampleRates)}</li>
          <li><strong>音の情報量:</strong> {audioBitrateMessage}</li>
        </ul>
      </section>
    );
  };

  const renderSelectorScreen = () => (
    <main className="app-shell">
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">OBS Stream Settings Advisor</span>
          <h1>OBS診断ちゃん</h1>
          <p className="version-badge">Version {appVersion}</p>
          <p className="hero-tagline">配信先ごとに、OBS の設定を見直しやすくするための診断アプリです。</p>
          <p className="hero-description">
            まずは配信先を選んでね。選んだ配信先ごとに、見る内容と説明を切り替えるよ。
          </p>
        </div>
        <div className="hero-portrait">
          <img src={okImg} alt="OBS診断ちゃん" width={168} height={168} />
        </div>
      </section>

      <section className="platform-grid">
        {(Object.keys(PLATFORM_RULES) as PlatformKey[]).map((platformKey) => {
          const rule = PLATFORM_RULES[platformKey];
          return (
            <button
              key={rule.key}
              type="button"
              className="platform-card"
              onClick={() => setSelectedPlatform(platformKey)}
            >
              <span className="platform-label">{rule.label}</span>
              <strong>{rule.shortDescription}</strong>
              <p>{rule.overview}</p>
            </button>
          );
        })}
      </section>
    </main>
  );

  if (!activeRules) {
    return renderSelectorScreen();
  }

  return (
    <main className="app-shell">
      <header className="diagnosis-header">
        <button type="button" className="back-link" onClick={() => setSelectedPlatform(null)}>
          ← 配信先を選び直す
        </button>
        <div className="header-main">
          <div>
            <span className="eyebrow">{activeRules.label} 用</span>
            <h1>OBS診断ちゃん</h1>
            <p className="version-badge">Version {appVersion}</p>
            <p className="hero-tagline">「きょうも、ちゃんと診てあげるから……安心してね？」</p>
            <p className="hero-description">{activeRules.modeNote}</p>
          </div>
          <img
            src={getCharacterImage()}
            alt="診断ちゃんの表情"
            width={132}
            height={132}
            className="status-portrait"
          />
        </div>
      </header>

      <section className="toolbar">
        <div className="toolbar-card">
          <span className="toolbar-label">現在の配信先</span>
          <strong>{activeRules.label}</strong>
          <p>{activeRules.overview}</p>
        </div>
        <div className="toolbar-card toolbar-card--compact">
          <Update />
        </div>
      </section>

      <section className="diagnosis-card">
        <h2>どの設定をみる？</h2>
        <ProfileSelector
          onProfileSelect={(name) => setSelectedProfile(name)}
          onProfilesLoaded={() => undefined}
        />

        {!selectedProfile && (
          <p className="message-warn">
            OBS をまだ起動していないか、設定の一覧がまだ作られていないのかも。
          </p>
        )}

        {selectedProfile && iniData === null && (
          <p className="message-warn">
            この設定はまだ読み込めなかったよ。
            OBS を一度起動して、設定を作り直してみてね。
          </p>
        )}
      </section>

      {selectedProfile && iniData && (
        <div className="diagnosis-grid">
          <section className="diagnosis-card diagnosis-card--summary">
            <h2>いまの設定</h2>
            <ul className="diagnosis-list">
              <li><strong>解像度:</strong> {iniData?.Video?.OutputCX} × {iniData?.Video?.OutputCY}</li>
              <li><strong>FPS:</strong> {getFps(iniData)}</li>
              <li><strong>設定の見せ方:</strong> {getOutputModeLabel(iniData)}</li>
              <li><strong>音声チャンネル:</strong> {iniData?.Audio?.ChannelSetup ?? 'Stereo'}</li>
            </ul>
          </section>

          {renderRecommendedSettings()}

          <section className="diagnosis-card diagnosis-card--wide">
            <h2>見てみた結果</h2>
            <ul className="diagnosis-list">
              <li>{diagnoseBitrate()[0]}</li>
              <li>{diagnoseRateControl()[0]}</li>
              <li>{diagnoseKeyframe()[0]}</li>
              <li>{diagnoseProfile()[0]}</li>
              <li>{diagnoseSampleRate()[0]}</li>
              <li>{diagnoseAudioBitrate()[0]}</li>
            </ul>
          </section>

          {renderNetworkDiagnostics()}
        </div>
      )}

      <footer className="app-footer">
        <p>
          診断基準: <a href={activeRules.docsUrl} target="_blank" rel="noopener noreferrer">{activeRules.docsLabel}</a>
        </p>
        <p>Version {appVersion}</p>
        <p>Copyright (c) 2025-2026 AllegroMoltoV. All rights reserved.</p>
      </footer>
    </main>
  );
}
