// src/type/preload.d.ts

export {};

declare global {
    interface Window {
        electronAPI: {
            selectFolder: () => Promise<string | null>;
        };
    }
}
