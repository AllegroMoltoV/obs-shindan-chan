// src/components/FolderSelector.tsx
import { useState } from 'react';

export default function FolderSelector({ onFolderSelected }: { onFolderSelected: (path: string) => void }) {
    const [selectedPath, setSelectedPath] = useState<string | null>(null);

    const handleClick = async () => {
        const result = await window.electronAPI.selectFolder(); // ← Electron 側と連携する関数（次に定義）
        if (result) {
            setSelectedPath(result);
            onFolderSelected(result);
        }
    };

    return (
        <div>
            <button onClick={handleClick}>OBSのプロファイルフォルダを選ぶ！</button>
            {selectedPath && <p>診断対象：{selectedPath}</p>}
        </div>
    );
}
