import { app, BrowserWindow, shell, ipcMain, dialog } from 'electron'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import { update } from './update'
import fs from 'fs';
import waitOn from 'wait-on';

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬ dist-electron
// │ ├─┬ main
// │ │ └── index.js    > Electron-Main
// │ └─┬ preload
// │   └── index.mjs   > Preload-Scripts
// ├─┬ dist
// │ └── index.html    > Electron-Renderer
//
process.env.APP_ROOT = path.join(__dirname, '../..')

export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

// Disable GPU Acceleration for Windows 7
if (os.release().startsWith('6.1')) app.disableHardwareAcceleration()

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

let win: BrowserWindow | null = null
const preload = path.join(__dirname, '../preload/index.mjs')
const indexHtml = path.join(RENDERER_DIST, 'index.html')

async function createWindow() {
  win = new BrowserWindow({
    title: 'OBS診断ちゃん',
    icon: path.join(__dirname, '../build/icon.ico'),
    width: 960,
    height: 1280,
    webPreferences: {
      preload,
      // contextIsolation: false, // 必要に応じて
    },
  });
  win.setMenuBarVisibility(false);
  win.setAutoHideMenuBar(true);

  if (VITE_DEV_SERVER_URL) {
    try {
      // dev server の起動を待つ
      await waitOn({ resources: [VITE_DEV_SERVER_URL], timeout: 10000 }); // 最大10秒待機
      await win.loadURL(VITE_DEV_SERVER_URL);
      win.webContents.openDevTools();
    } catch (err) {
      console.error("Vite dev server に接続できませんでした:", err);
      win.loadFile(indexHtml); // フォールバック
    }
  } else {
    await win.loadFile(indexHtml);
  }

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString());
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url);
    return { action: 'deny' };
  });

  update(win);
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  win = null
  if (process.platform !== 'darwin') app.quit()
})

app.on('second-instance', () => {
  if (win) {
    // Focus on the main window if the user tried to open another
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows()
  if (allWindows.length) {
    allWindows[0].focus()
  } else {
    createWindow()
  }
})

// New window example arg: new windows url
ipcMain.handle('open-win', (_, arg) => {
  const childWindow = new BrowserWindow({
    webPreferences: {
      preload,
      nodeIntegration: true,
      contextIsolation: false,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    childWindow.loadURL(`${VITE_DEV_SERVER_URL}#${arg}`)
  } else {
    childWindow.loadFile(indexHtml, { hash: arg })
  }
})

// OBS Shindan Chan

const watchedFiles = new Map<string, fs.FSWatcher>();

ipcMain.handle("list-obs-profiles", async () => {
  try {
    const userDir = os.homedir();
    const profilesDir = path.join(userDir, "AppData", "Roaming", "obs-studio", "basic", "profiles");

    if (!fs.existsSync(profilesDir)) {
      console.warn("OBSのプロファイルディレクトリが存在しません");
      return [];
    }

    const entries = fs.readdirSync(profilesDir, { withFileTypes: true });
    const profiles = entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);

    return profiles;
  } catch (err) {
    console.error("OBSプロファイル読み取り中にエラー:", err);
    return [];
  }
});

ipcMain.handle("read-basic-ini", async (event, profileName: string) => {
  try {
    const userDir = os.homedir();
    const iniPath = path.join(
        userDir,
        "AppData",
        "Roaming",
        "obs-studio",
        "basic",
        "profiles",
        profileName,
        "basic.ini"
    );

    if (!fs.existsSync(iniPath)) {
      throw new Error("basic.ini が見つかりません");
    }

    return fs.readFileSync(iniPath, "utf-8");
  } catch (err) {
    console.error("INI 読み込みエラー:", err);
    throw err;
  }
});

ipcMain.handle("read-encoder-json", async (event, profileName: string) => {
  try {
    const userDir = os.homedir();
    const jsonPath = path.join(
        userDir,
        "AppData",
        "Roaming",
        "obs-studio",
        "basic",
        "profiles",
        profileName,
        "streamEncoder.json"
    );

    if (!fs.existsSync(jsonPath)) {
      return null;
    }

    const content = fs.readFileSync(jsonPath, "utf-8");
    return JSON.parse(content);
  } catch (err) {
    console.error("streamEncoder.json 読み込みエラー:", err);
    return null;
  }
});

ipcMain.handle("watch-profile-files", (event, profileName: string) => {
  const win = BrowserWindow.getFocusedWindow();
  if (!win) return;

  const userDir = os.homedir();
  const profileDir = path.join(
      userDir,
      "AppData",
      "Roaming",
      "obs-studio",
      "basic",
      "profiles",
      profileName
  );

  const targets = ["basic.ini", "streamEncoder.json"];

  targets.forEach((filename) => {
    const fullPath = path.join(profileDir, filename);
    if (watchedFiles.has(fullPath)) return;

    if (fs.existsSync(fullPath)) {
      const watcher = fs.watch(fullPath, { persistent: true }, () => {
        win.webContents.send("profile-file-updated", filename);
      });
      watchedFiles.set(fullPath, watcher);
    }
  });
});

import './networkDiagnostics';