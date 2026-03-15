export type PlatformKey = 'youtube' | 'twitch';
export type AudioChannelType = 'stereo' | 'surround' | 'other';

type BitrateRecommendation = {
  width: number;
  height: number;
  fps: number;
  min: number;
  max: number;
  recommended: number;
};

type TableBitrateRule = {
  mode: 'table';
  recommendations: BitrateRecommendation[];
  comment: {
    ok: string;
    low: string;
    high: string;
    unavailable: string;
  };
};

type CapBitrateRule = {
  mode: 'cap';
  max: number;
  recommended: string;
  comment: {
    ok: string;
    high: string;
  };
};

type AudioRule = {
  sampleRates: number[];
  recommendedSampleRate: number;
  bitrate: {
    exact?: number;
    recommended: number;
    min?: number;
    max?: number;
  };
  comment: {
    sampleRate: string;
    bitrate: string;
  };
};

export type PlatformRuleSet = {
  key: PlatformKey;
  label: string;
  shortDescription: string;
  overview: string;
  docsUrl: string;
  docsLabel: string;
  modeNote: string;
  bitrate: TableBitrateRule | CapBitrateRule;
  encoding: {
    requireCBR: boolean;
    comment: {
      ok: string;
      warn: string;
    };
  };
  keyframeInterval: {
    expectedSeconds: number;
    comment: {
      ok: string;
      warn: string;
    };
  };
  profile: {
    allowed: string[];
    comment: {
      ok: string;
      warn: string;
    };
  };
  audio: Record<AudioChannelType, AudioRule>;
};

export const PLATFORM_RULES: Record<PlatformKey, PlatformRuleSet> = {
  youtube: {
    key: 'youtube',
    label: 'YouTube Live',
    shortDescription: 'YouTube 配信向けに設定を見直しやすい定番コース',
    overview: 'YouTube の案内に合わせて、画質や音の設定がちょうどよさそうかを見ていきます。',
    docsUrl: 'https://support.google.com/youtube/answer/2853702?hl=ja',
    docsLabel: 'YouTube ライブ エンコーダ配信設定',
    modeNote: 'この画面では、YouTube 配信向けに画質や音の設定をチェックしていくよ。',
    bitrate: {
      mode: 'table',
      recommendations: [
        { width: 3840, height: 2160, fps: 60, min: 10000, max: 40000, recommended: 35000 },
        { width: 3840, height: 2160, fps: 30, min: 8000, max: 35000, recommended: 30000 },
        { width: 2560, height: 1440, fps: 60, min: 6000, max: 30000, recommended: 24000 },
        { width: 2560, height: 1440, fps: 30, min: 5000, max: 25000, recommended: 15000 },
        { width: 1920, height: 1080, fps: 60, min: 4000, max: 12000, recommended: 10000 },
        { width: 1920, height: 1080, fps: 30, min: 3000, max: 10000, recommended: 8000 },
        { width: 1280, height: 720, fps: 60, min: 3000, max: 8000, recommended: 6000 },
        { width: 1280, height: 720, fps: 30, min: 3000, max: 8000, recommended: 4000 },
      ],
      comment: {
        ok: 'ちょうどよさそうだよ。',
        low: '少し低めかも。画質が荒れやすいかもしれないね。',
        high: 'ちょっと高めかも。回線が忙しくなりそう。',
        unavailable: 'この大きさやなめらかさは表にないから、ここは手で確認してみてね。',
      },
    },
    encoding: {
      requireCBR: true,
      comment: {
        ok: 'ここは安定寄りでいい感じ。',
        warn: 'ここは CBR にしておくと安心だよ。',
      },
    },
    keyframeInterval: {
      expectedSeconds: 2,
      comment: {
        ok: 'ここもおすすめどおりだよ。',
        warn: 'ここは 2 秒にしておくのがおすすめだよ。',
      },
    },
    profile: {
      allowed: ['high', 'main', 'default'],
      comment: {
        ok: 'この設定ならだいじょうぶそう。',
        warn: 'ここは main か high にしておくと安心だよ。',
      },
    },
    audio: {
      stereo: {
        sampleRates: [44100],
        recommendedSampleRate: 44100,
        bitrate: { exact: 128, recommended: 128 },
        comment: {
          sampleRate: 'ステレオなら 44.1kHz にしておくとまとまりやすいよ。',
          bitrate: 'ステレオなら 128kbps くらいがちょうどよさそう。',
        },
      },
      surround: {
        sampleRates: [48000],
        recommendedSampleRate: 48000,
        bitrate: { exact: 384, recommended: 384 },
        comment: {
          sampleRate: 'サラウンドなら 48kHz にしておくのがおすすめだよ。',
          bitrate: 'サラウンドなら 384kbps くらいを目安にするとよさそう。',
        },
      },
      other: {
        sampleRates: [44100],
        recommendedSampleRate: 44100,
        bitrate: { exact: 128, recommended: 128 },
        comment: {
          sampleRate: '迷ったら 44.1kHz にしておくと安心だよ。',
          bitrate: '迷ったら 128kbps あたりを目安にしてみてね。',
        },
      },
    },
  },
  twitch: {
    key: 'twitch',
    label: 'Twitch',
    shortDescription: 'Twitch 配信向けに安定しやすい設定を見るコース',
    overview: 'Twitch の案内をもとに、配信が安定しやすい設定になっているかを見ていきます。',
    docsUrl: 'https://help.twitch.tv/s/article/broadcasting-guidelines?language=ja',
    docsLabel: 'Twitch 配信ガイドライン',
    modeNote: 'この画面では、Twitch 配信向けに安定しやすい設定かどうかを一緒に見ていくよ。',
    bitrate: {
      mode: 'cap',
      max: 6000,
      recommended: '上限は 6000kbps だよ。ふだんは回線の余裕を少し残しておくと安心。',
      comment: {
        ok: 'このくらいなら安心して使えそう。',
        high: '少し盛りすぎかも。6000kbps 以内にすると安心だよ。',
      },
    },
    encoding: {
      requireCBR: true,
      comment: {
        ok: 'ここは安定寄りでいい感じ。',
        warn: 'ここは CBR にしておくと安心だよ。',
      },
    },
    keyframeInterval: {
      expectedSeconds: 2,
      comment: {
        ok: 'ここもいい感じ。',
        warn: 'ここは 2 秒にしておくのがおすすめだよ。',
      },
    },
    profile: {
      allowed: ['main', 'baseline', 'base'],
      comment: {
        ok: 'この設定ならだいじょうぶそう。',
        warn: 'ここは main か baseline にしておくと安心だよ。',
      },
    },
    audio: {
      stereo: {
        sampleRates: [44100, 48000],
        recommendedSampleRate: 48000,
        bitrate: { recommended: 128, min: 128, max: 320 },
        comment: {
          sampleRate: 'Twitch なら 44.1kHz か 48kHz にしておくと安心だよ。',
          bitrate: '音の設定は 128kbps から 320kbps のあいだを目安にしてみてね。',
        },
      },
      surround: {
        sampleRates: [44100, 48000],
        recommendedSampleRate: 48000,
        bitrate: { recommended: 128, min: 128, max: 320 },
        comment: {
          sampleRate: 'Twitch なら 44.1kHz か 48kHz にしておくと安心だよ。',
          bitrate: '音の設定は 128kbps から 320kbps のあいだを目安にしてみてね。',
        },
      },
      other: {
        sampleRates: [44100, 48000],
        recommendedSampleRate: 48000,
        bitrate: { recommended: 128, min: 128, max: 320 },
        comment: {
          sampleRate: 'Twitch なら 44.1kHz か 48kHz にしておくと安心だよ。',
          bitrate: '音の設定は 128kbps から 320kbps のあいだを目安にしてみてね。',
        },
      },
    },
  },
};
