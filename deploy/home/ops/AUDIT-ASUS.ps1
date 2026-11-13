# YouTube Buddy X - ASUS read-only audit. Changes NOTHING: it only reads settings and writes this report.
# Run: right-click this file -> "Run with PowerShell"  (or: powershell -ExecutionPolicy Bypass -File AUDIT-ASUS.ps1)
# It prints no passwords or keys. It opens deploy\home\.env only to print the single line COMPOSE_PROFILES=... (not a secret).
$out = Join-Path $PSScriptRoot "audit-asus-report.txt"
function S($t){ "`n===== $t =====" }
& {
  S "time"; Get-Date -Format "yyyy-MM-dd HH:mm:ss zzz"
  S "computer"; $cs = Get-CimInstance Win32_ComputerSystem; $os = Get-CimInstance Win32_OperatingSystem
  "{0} | RAM {1:N1} GB | {2} {3} build {4}" -f $cs.Model, ($cs.TotalPhysicalMemory/1GB), $os.Caption, $os.Version, $os.BuildNumber
  (Get-CimInstance Win32_Processor).Name
  Get-CimInstance Win32_VideoController | ForEach-Object { "GPU: " + $_.Name }
  S "physical disks"; Get-PhysicalDisk | Format-Table -AutoSize FriendlyName, MediaType, BusType, @{n='SizeGB';e={[math]::Round($_.Size/1GB)}}, HealthStatus | Out-String -Width 200
  S "volumes -> which disk"; Get-Partition | Where-Object DriveLetter | ForEach-Object {
     $v = Get-Volume -DriveLetter $_.DriveLetter
     "{0}:  disk {1}  size {2:N0} GB  free {3:N0} GB  {4}  label '{5}'" -f $_.DriveLetter, $_.DiskNumber, ($v.Size/1GB), ($v.SizeRemaining/1GB), $v.FileSystem, $v.FileSystemLabel }
  S "USB / removable drives right now"; Get-Volume | Where-Object DriveType -eq 'Removable' | Format-Table DriveLetter, FileSystemLabel, @{n='SizeGB';e={[math]::Round($_.Size/1GB)}} | Out-String
  S "power: sleep / hibernate / lid (AC = plugged in)"
  powercfg /getactivescheme
  powercfg /query SCHEME_CURRENT SUB_SLEEP STANDBYIDLE | Select-String "Current AC|Current DC"
  powercfg /query SCHEME_CURRENT SUB_SLEEP HIBERNATEIDLE | Select-String "Current AC|Current DC"
  powercfg /query SCHEME_CURRENT SUB_BUTTONS LIDACTION | Select-String "Current AC|Current DC"
  "(0x0 = never / do nothing; seconds otherwise. Lid: 0=nothing 1=sleep 2=hibernate 3=shut down)"
  S "Docker Desktop starts at sign-in?"
  Get-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -ErrorAction SilentlyContinue | Select-Object * -ExcludeProperty PS* | Format-List | Out-String
  $ds = Join-Path $env:APPDATA "Docker\settings-store.json"; if (!(Test-Path $ds)) { $ds = Join-Path $env:APPDATA "Docker\settings.json" }
  if (Test-Path $ds) { Select-String -Path $ds -Pattern '"AutoStart"|"autoStart"|"MemoryMiB"|"memoryMiB"|"Cpus"|"cpus"' | ForEach-Object { $_.Line.Trim() } }
  S "Docker containers"; docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Image}}" 2>&1
  S "Docker container memory/CPU now"; docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" 2>&1
  S "Docker disk use"; docker system df 2>&1
  S "Docker volumes"; docker volume ls 2>&1
  S "Docker log settings of web container"; docker inspect youtubebuddy-web-1 --format "{{json .HostConfig.LogConfig}}" 2>&1
  S "Is the llm container set to auto-start? (value of COMPOSE_PROFILES only, never secrets)"
  $envf = Join-Path $env:USERPROFILE "YOUTUBE-BUDDY\deploy\home\.env"
  if (Test-Path $envf) { Get-Content $envf | Where-Object { $_ -match '^\s*COMPOSE_PROFILES=' } }
  S "Tailscale installed?"; $ts = Get-Command tailscale -ErrorAction SilentlyContinue; if ($ts) { tailscale version } else { "not installed" }
  S "scheduled tasks mentioning backup/docker/youtube"; Get-ScheduledTask | Where-Object { $_.TaskName -match 'backup|docker|youtube|buddy' } | Format-Table TaskName, State | Out-String
  S "network adapters (up)"; Get-NetAdapter | Where-Object Status -eq 'Up' | Format-Table Name, InterfaceDescription, LinkSpeed | Out-String
  S "Windows Update active hours"; Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\WindowsUpdate\UX\Settings" -ErrorAction SilentlyContinue | Select-Object ActiveHoursStart, ActiveHoursEnd | Format-List | Out-String
  S "end"
} *>&1 | Out-File -FilePath $out -Encoding utf8
Write-Host "Done. Report saved to $out  - you can close this window."
