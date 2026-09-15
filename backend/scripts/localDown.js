const { spawnSync } = require("child_process");

spawnSync(
    "powershell.exe",
    [
        "-NoProfile",
        "-Command",
        "$connection = Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue; if ($connection) { Stop-Process -Id $connection.OwningProcess -Force }"
    ],
    { stdio: "inherit", windowsHide: true }
);

const result = spawnSync(
    "wsl.exe",
    ["-e", "pkill", "-INT", "-x", "anvil"],
    { stdio: "inherit", windowsHide: true }
);

if (result.status !== 0 && result.status !== 1) {
    process.exitCode = result.status || 1;
}
