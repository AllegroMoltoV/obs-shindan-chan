// src/type/preload.d.ts

export {};

export interface ElectronAPI {
    getOBSProfiles: () => Promise<string[]>;
    readBasicINI: (profileName: string) => Promise<string>;
    readEncoderJSON: (profileName: string) => Promise<{ rate_control: string; crf?: number } | null>;
    watchProfileFiles: (profileName: string) => void;
    onProfileFileUpdated: (callback: (event: any, filename: string) => void) => void;
    // 他のAPIがあれば追記
}

declare global {
    interface Window {
        electronAPI: ElectronAPI;
    }
}

