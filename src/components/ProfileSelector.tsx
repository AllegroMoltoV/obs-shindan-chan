// src/components/ProfileSelector.tsx

import React, { useEffect, useState } from "react";

type Props = {
    onProfileSelect: (name: string) => void;
    onProfilesLoaded: (profiles: string[]) => void;
};

export default function ProfileSelector({ onProfileSelect, onProfilesLoaded }: Props) {
    const [profiles, setProfiles] = useState<string[]>([]);
    const [selected, setSelected] = useState<string>("");

    useEffect(() => {
        window.electronAPI.getOBSProfiles().then((list) => {
            setProfiles(list);
            onProfilesLoaded(list);
            if (list.length > 0) {
                setSelected(list[0]);
                onProfileSelect(list[0]);
            }
        });
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setSelected(e.target.value);
        onProfileSelect(e.target.value);
    };

    return profiles.length === 0 ? null : (
        <div>
            <label>OBS プロファイルを選んでね：</label>
            <select value={selected} onChange={handleChange}>
                {profiles.map((name) => (
                    <option key={name} value={name}>
                        {name}
                    </option>
                ))}
            </select>
        </div>
    );
}
