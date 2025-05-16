import React, { useEffect, useState } from "react";

type Props = {
    onProfileSelect: (profileName: string) => void;
};

const ProfileSelector: React.FC<Props> = ({ onProfileSelect }) => {
    const [profiles, setProfiles] = useState<string[]>([]);
    const [selected, setSelected] = useState<string>("");

    useEffect(() => {
        window.electronAPI.getOBSProfiles().then((list) => {
            setProfiles(list);
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

    return (
        <div>
            <label>OBS プロファイルを選んでね：</label>
            <select value={selected} onChange={handleChange}>
                {profiles.map((profile) => (
                    <option key={profile} value={profile}>
                        {profile}
                    </option>
                ))}
            </select>
        </div>
    );
};

export default ProfileSelector;
