# OBS診断ちゃん

OBS Studio の配信設定を診断し、配信先ガイドラインとの差分を分かりやすく確認する Windows 向けデスクトップアプリです。YouTube Live と Twitch のモードを切り替えながら、配信先ごとに違う推奨設定を確認できます。

## できること

- OBS のプロファイル一覧を読み取り、対象プロファイルを選択できます
- `basic.ini` と `streamEncoder.json` を解析し、映像・音声・ネットワーク設定を診断できます
- 解像度、FPS、映像ビットレート、音声ビットレート、サンプルレート、キーフレーム間隔、レート制御、プロファイル設定を確認できます
- プロファイル更新を監視し、設定変更後に再診断できます

## 対応環境

- OS: Windows
- OBS Studio のプロファイルが `%AppData%/obs-studio/basic/profiles` に存在すること
- Node.js と npm は開発時のみ必要です

## スクリーンショット

![screenshot](https://www.allegromoltov.jp/_next/image?url=%2Fimg%2Fproduct-obs-shindan-chan.png&w=640&q=75)

## 診断ロジック

- 映像ビットレートは解像度と FPS の組み合わせごとの推奨帯域と比較します
- 詳細出力モードではレート制御が CBR かどうかを確認します
- キーフレーム間隔は配信先ガイドラインの推奨値と比較します
- H.264 プロファイル設定をチェックします
- 音声はチャンネル構成に応じてサンプルレートとビットレートを確認します
- 簡易ネットワーク診断として ping と接続種別を表示します

YouTube Live は [解像度別の推奨ビットレート表](https://support.google.com/youtube/answer/2853702?hl=ja) を使い、Twitch は [6000kbps 上限とエンコード条件](https://help.twitch.tv/s/article/broadcasting-guidelines?language=ja) を中心に別ルールセットとして診断します。

## 配布手順

今後の配布は OneDrive ではなく GitHub Releases を前提にします。現時点では手動公開を想定しています。

1. `npm install`
2. `npm run build`
3. `dist-release` に生成された Windows インストーラを確認
4. GitHub Releases で対象タグにアセットを手動アップロード

自動更新は GitHub Releases を参照する構成に切り替えています。`latest.yml` とインストーラを同じリリースに配置する運用を想定しています。

## 開発手順

```bash
git clone https://github.com/AllegroMoltoV/obs-shindan-chan.git
cd obs-shindan-chan
npm install
npm run dev
```

主要コマンド:

- `npm run dev`: 開発モードで起動
- `npm run build`: 本番ビルドと Windows インストーラ生成
- `npm run test`: Vitest を実行
- `npm run test:e2e`: Playwright による E2E テストを実行

## 更新情報

### v2.0.0

- GitHub 公開を前提に README とリポジトリ設定を整理
- GitHub Releases ベースの配布方針へ移行開始
- Windows 向け配布設定と更新確認 UI を見直し
- YouTube / Twitch のモード切り替え画面と別ルールセットを追加

### v1.1.4

- OBS プロファイルの読み取りと基本診断機能を実装
- YouTube Live を基準にした映像・音声・ネットワーク診断を実装
- Electron + React ベースの Windows アプリとして初期版を作成
