import FolderSelector from './components/FolderSelector';

export default function App() {
    const handleFolder = (path: string) => {
        console.log('選ばれたパス:', path);
        // あとで ini 読み込みに使う
    };

    return (
        <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
            <h1>OBS診断ちゃん</h1>
            <p>「きょうも、ちゃんと診てあげるから……安心してね？」</p>
            <FolderSelector onFolderSelected={handleFolder} />
        </div>
    );
}