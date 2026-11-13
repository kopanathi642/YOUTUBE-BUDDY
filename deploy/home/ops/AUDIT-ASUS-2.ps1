# YouTube Buddy X - ASUS read-only audit, part 2. Changes NOTHING, starts/stops NOTHING. Writes one report next to itself.
# Reads: why the llm container stopped (state, logs, Docker events), Windows memory/sleep/restart events,
# lid setting, auto sign-in flag (never the password), volume sizes, tools for encrypted backups.
# It prints no passwords or keys and does not open .env.
$out = Join-Path $PSScriptRoot "audit-asus-report-2.txt"
function S($t){ "`n===== $t =====" }
& {
  S "time"; Get-Date -Format "yyyy-MM-dd HH:mm:ss zzz"
  S "last boot"; (Get-CimInstance Win32_OperatingSystem).LastBootUpTime
  S "llm container state (exit code, OOM flag, times)"; docker inspect youtubebuddy-llm-1 --format "{{json .State}}" 2>&1
  S "llm container memory limit (bytes)"; docker inspect youtubebuddy-llm-1 --format "{{.HostConfig.Memory}}" 2>&1
  S "llm container last 80 log lines"; docker logs --timestamps --tail 80 youtubebuddy-llm-1 2>&1
  $now = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss")
  S "Docker events for llm, last 72 h (kill/oom/die/stop)"; docker events --since 72h --until $now --filter container=youtubebuddy-llm-1 2>&1
  S "Docker events: any OOM in last 72 h"; docker events --since 72h --until $now --filter event=oom 2>&1
  S "Docker engine memory"; docker info --format "MemTotal={{.MemTotal}} CPUs={{.NCPU}} Kernel={{.KernelVersion}} ServerVersion={{.ServerVersion}}" 2>&1
  S ".wslconfig (WSL memory limit)"; $w = Join-Path $env:USERPROFILE ".wslconfig"; if (Test-Path $w) { Get-Content $w } else { "no .wslconfig (WSL default = 50% of RAM)" }
  S "volume sizes"; docker system df -v 2>&1 | Select-String -Pattern "VOLUME NAME|youtube" 
  S "Windows low-memory events, last 7 days (Resource-Exhaustion 2004)"
  Get-WinEvent -FilterHashtable @{LogName='System'; Id=2004; StartTime=(Get-Date).AddDays(-7)} -ErrorAction SilentlyContinue | Select-Object -First 10 TimeCreated, Message | Format-List | Out-String -Width 200
  S "sleep / wake events, last 7 days (Kernel-Power 42 = sleep, Power-Troubleshooter 1 = wake)"
  Get-WinEvent -FilterHashtable @{LogName='System'; Id=42,1; StartTime=(Get-Date).AddDays(-7)} -ErrorAction SilentlyContinue | Where-Object { $_.ProviderName -match 'Kernel-Power|Power-Troubleshooter' } | Select-Object -First 15 TimeCreated, ProviderName, Id | Format-Table | Out-String
  S "restarts / shutdowns, last 14 days (1074 = who restarted, 6008 = unexpected)"
  Get-WinEvent -FilterHashtable @{LogName='System'; Id=1074,6008; StartTime=(Get-Date).AddDays(-14)} -ErrorAction SilentlyContinue | Select-Object -First 10 TimeCreated, Id, @{n='Msg';e={$_.Message.Substring(0,[Math]::Min(160,$_.Message.Length))}} | Format-List | Out-String -Width 200
  S "lid close action (AC/DC)"; powercfg /query SCHEME_CURRENT 4f971e89-eebd-4455-a8de-9e59040e7347 5ca83367-6e45-459f-a27b-476b1d01c936 | Select-String "Current AC|Current DC"
  S "sleep timeout (AC/DC)"; powercfg /query SCHEME_CURRENT 238c9fa8-0aad-41ed-83f4-97be242c8f20 29f6c1db-86da-48c5-9fdb-f2b67b1f44da | Select-String "Current AC|Current DC"
  S "hibernate timeout (AC/DC)"; powercfg /query SCHEME_CURRENT 238c9fa8-0aad-41ed-83f4-97be242c8f20 9d7815a6-7ee4-497e-8888-515a05f02364 | Select-String "Current AC|Current DC"
  S "auto sign-in enabled? (flag only, never the password)"; (Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" -Name AutoAdminLogon -ErrorAction SilentlyContinue).AutoAdminLogon
  S "encryption tools already on this PC (no install needed?)"
  foreach ($p in "C:\Program Files\Git\usr\bin\gpg.exe","C:\Program Files\Git\usr\bin\openssl.exe","C:\Program Files\7-Zip\7z.exe") { "{0}  {1}" -f (Test-Path $p), $p }
  S "Docker volume folder reachable from Windows (for incremental copies)"
  foreach ($p in "\\wsl.localhost\docker-desktop\mnt\docker-desktop-disk\data\docker\volumes","\\wsl.localhost\docker-desktop-data\data\docker\volumes") { "{0}  {1}" -f (Test-Path $p), $p }
  S "D: top-level folders (names only)"; Get-ChildItem D:\ -Directory -Force -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name
  S "end"
} *>&1 | Out-File -FilePath $out -Encoding utf8
Write-Host "Done. Report saved to $out  - you can close this window."
