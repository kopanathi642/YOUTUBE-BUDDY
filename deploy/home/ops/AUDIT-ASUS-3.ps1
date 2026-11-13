# YouTube Buddy X - ASUS read-only audit, part 3: why did Windows shut down unexpectedly? Changes NOTHING.
# Reads Windows event logs and power settings. Writes two files next to itself: audit-asus-report-3.txt and
# battery-report.html (Windows' own battery report). Does not open .env, does not touch Docker, prints no secrets.
$out = Join-Path $PSScriptRoot "audit-asus-report-3.txt"
function S($t){ "`n===== $t =====" }
function Ev($ids, $days, $log = 'System') { Get-WinEvent -FilterHashtable @{LogName=$log; Id=$ids; StartTime=(Get-Date).AddDays(-$days)} -ErrorAction SilentlyContinue }
& {
  S "time"; Get-Date -Format "yyyy-MM-dd HH:mm:ss zzz"
  S "Kernel-Power 41 (rebooted without clean shutdown): BugcheckCode 0 = no crash screen; PowerButtonTimestamp<>0 = power button held; SleepInProgress<>0 = died while entering sleep"
  Ev 41 21 | Where-Object ProviderName -eq 'Microsoft-Windows-Kernel-Power' | ForEach-Object {
    $x = [xml]$_.ToXml(); $d = @{}; $x.Event.EventData.Data | ForEach-Object { $d[$_.Name] = $_.'#text' }
    "{0}  BugcheckCode={1} PowerButtonTimestamp={2} SleepInProgress={3} LongPowerButtonPressDetected={4}" -f $_.TimeCreated, $d.BugcheckCode, $d.PowerButtonTimestamp, $d.SleepInProgress, $d.LongPowerButtonPressDetected }
  S "Blue-screen crashes (BugCheck 1001), last 21 days"; Ev 1001 21 | Where-Object ProviderName -match 'BugCheck|WER' | Select-Object TimeCreated, @{n='Msg';e={$_.Message.Substring(0,[Math]::Min(200,$_.Message.Length))}} | Format-List | Out-String -Width 220
  S "Hardware errors (WHEA-Logger), last 21 days"; Get-WinEvent -FilterHashtable @{LogName='System'; ProviderName='Microsoft-Windows-WHEA-Logger'; StartTime=(Get-Date).AddDays(-21)} -ErrorAction SilentlyContinue | Select-Object -First 10 TimeCreated, Id | Format-Table | Out-String
  S "Disk / file-system errors (disk 7,51,153; Ntfs 55,98; storahci/stornvme 129), last 21 days"; Ev 7,51,55,98,129,153 21 | Select-Object -First 15 TimeCreated, ProviderName, Id | Format-Table | Out-String
  S "Power source changes AC<->battery (Kernel-Power 105), last 7 days"; Ev 105 7 | Select-Object -First 20 TimeCreated, @{n='Msg';e={$_.Message.Substring(0,[Math]::Min(120,$_.Message.Length))}} | Format-Table -Wrap | Out-String -Width 200
  S "Critical battery / thermal (Kernel-Power 125, 89, 86; Kernel-Processor-Power 37 = speed limited by firmware/heat), last 21 days"
  Ev 125,89,86,37 21 | Select-Object -First 15 TimeCreated, ProviderName, Id | Format-Table | Out-String
  S "Clean start/stop markers (EventLog 6005 start, 6006 clean stop, 6008 unexpected), last 21 days"; Ev 6005,6006,6008 21 | Select-Object -First 30 TimeCreated, Id | Format-Table | Out-String
  S "Windows Update installs, last 21 days (WindowsUpdateClient 19)"; Ev 19 21 | Where-Object ProviderName -match 'WindowsUpdateClient' | Select-Object -First 10 TimeCreated, @{n='Update';e={$_.Message.Substring(0,[Math]::Min(140,$_.Message.Length))}} | Format-Table -Wrap | Out-String -Width 200
  S "Low virtual memory warnings (Resource-Exhaustion 2004), last 21 days"; Ev 2004 21 | Select-Object -First 10 TimeCreated | Format-Table | Out-String
  S "Lid close action incl. hidden setting (/qh)"; powercfg /qh SCHEME_CURRENT 4f971e89-eebd-4455-a8de-9e59040e7347 5ca83367-6e45-459f-a27b-476b1d01c936 | Select-String "Current AC|Current DC"
  S "Available sleep states"; powercfg /a
  S "Battery report (saved next to this file as battery-report.html)"; powercfg /batteryreport /output (Join-Path $PSScriptRoot "battery-report.html") 2>&1
  S "end"
} *>&1 | Out-File -FilePath $out -Encoding utf8
Write-Host "Done. Report saved to $out  - you can close this window."
