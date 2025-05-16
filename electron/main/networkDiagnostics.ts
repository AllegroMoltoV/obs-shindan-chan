import { ipcMain } from "electron";
import { exec } from "child_process";

// ping 値とロス率の取得
ipcMain.handle("get-ping-stats", () => {
    return new Promise((resolve) => {
        // 注意：PowerShell では "&&" がエラーになるため、cmd 経由で chcp を使用
        const command = 'cmd.exe /c "chcp 437 > nul && ping -n 5 -w 1000 1.1.1.1"';

        exec(command, (err, stdout, stderr) => {
            if (err) {
                console.error("Ping command failed:", err);
                resolve({ avgPing: null, loss: null });
                return;
            }

            const log = stdout.toString();

            // タイムアウト明示対応
            if (/request timed out/i.test(log) || /要求がタイムアウトしました/i.test(log)) {
                resolve({ avgPing: null, loss: 100 });
                return;
            }

            // ロケール非依存で ping 応答時間を取得
            const matchTime = log.match(/(?:平均|Average)[^=]*=\s*(\d+)\s*ms/i);
            const matchLoss = log.match(/(\d+)%\s*(?:の損失|loss)/i);

            resolve({
                avgPing: matchTime ? parseInt(matchTime[1], 10) : null,
                loss: matchLoss ? parseInt(matchLoss[1], 10) : null,
            });
        });
    });
});

// 接続種別（Wi-Fi or 有線）の取得
ipcMain.handle("get-network-type", () => {
    return new Promise((resolve) => {
        exec(
            'powershell -Command "Get-NetAdapter | Where-Object { $_.Status -eq \'Up\' } | Select-Object -ExpandProperty InterfaceDescription"',
            (err, stdout) => {
                if (err) {
                    console.error("Network type check failed:", err);
                    resolve({ type: "不明" });
                    return;
                }

                const desc = stdout.toLowerCase();
                const isWifi = desc.includes("wi-fi") || desc.includes("wireless") || desc.includes("wlan");
                resolve({ type: isWifi ? "Wi-Fi" : "有線" });
            }
        );
    });
});
