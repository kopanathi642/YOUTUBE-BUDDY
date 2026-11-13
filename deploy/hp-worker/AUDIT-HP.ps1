# YouTube Buddy X - HP Victus read-only audit. Changes NOTHING; installs NOTHING. Writes one report next to itself.
# Run: right-click -> "Run with PowerShell"   (or: powershell -ExecutionPolicy Bypass -File AUDIT-HP.ps1)
$out = Join-Path $PSScriptRoot "audit-hp-report.txt"
function S($t){ "`n===== $t =====" }
function Have($c){ $x = Get-Command $c -ErrorAction SilentlyContinue; if ($x) { $x.Source } else { "not installed" } }
& {
  S "time"; Get-Date -Format "yyyy-MM-dd HH:mm:ss zzz"
  S "computer"; $cs = Get-CimInstance Win32_ComputerSystem; $os = Get-CimInstance Win32_OperatingSystem
  "{0} {1} | host {2} | RAM {3:N1} GB | {4} build {5}" -f $cs.Manufacturer, $cs.Model, $env:COMPUTERNAME, ($cs.TotalPhysicalMemory/1GB), $os.Caption, $os.BuildNumber
  (Get-CimInstance Win32_Processor).Name
  S "GPUs"; Get-CimInstance Win32_VideoController | ForEach-Object { "{0} | driver {1}" -f $_.Name, $_.DriverVersion }
  S "nvidia-smi"; $smi = Have "nvidia-smi"; if ($smi -ne "not installed") { nvidia-smi; nvidia-smi --query-gpu=name,driver_version,memory.total,memory.used,temperature.gpu,power.limit --format=csv } else { "nvidia-smi not found (NVIDIA driver missing?)" }
  S "disks"; Get-Volume | Where-Object DriveLetter | Format-Table DriveLetter, FileSystemLabel, @{n='SizeGB';e={[math]::Round($_.Size/1GB)}}, @{n='FreeGB';e={[math]::Round($_.SizeRemaining/1GB)}} | Out-String
  S "tools"; foreach ($c in "python","py","git","ffmpeg","docker","wsl","tailscale","nvcc") { "{0,-10} {1}" -f $c, (Have $c) }
  S "python versions"; if ((Have "py") -ne "not installed") { py -0p 2>&1 } ; if ((Have "python") -ne "not installed") { python --version 2>&1 }
  S "ffmpeg NVENC encoders"; if ((Have "ffmpeg") -ne "not installed") { ffmpeg -hide_banner -encoders 2>&1 | Select-String "nvenc" } else { "ffmpeg not installed" }
  S "torch + CUDA (only if Python has torch)"; if ((Have "python") -ne "not installed") { python -c "import torch;print(torch.__version__, torch.cuda.is_available(), torch.cuda.get_device_name(0) if torch.cuda.is_available() else '')" 2>&1 }
  S "power (AC)"; powercfg /getactivescheme; powercfg /query SCHEME_CURRENT SUB_SLEEP STANDBYIDLE | Select-String "Current AC"
  S "network adapters (up)"; Get-NetAdapter | Where-Object Status -eq 'Up' | Format-Table Name, InterfaceDescription, LinkSpeed | Out-String
  S "end"
} *>&1 | Out-File -FilePath $out -Encoding utf8
Write-Host "Done. Report saved to $out  - you can close this window."
