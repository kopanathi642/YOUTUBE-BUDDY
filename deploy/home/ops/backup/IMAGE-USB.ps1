# YouTube Buddy X - read-only sector image of a (possibly failing) USB drive, for data recovery.
# * Opens the drive with READ access only (GENERIC_READ). Nothing is written to it: no repair, no format, no chkdsk.
# * Writes the image to a DIFFERENT physical disk (default D:\YB-Backups\recovery), refusing to overwrite anything.
# * Unreadable areas: each failing 1 MiB block is retried in 4 KiB pieces; pieces that still fail are written as zeros
#   and their offsets are logged, so one bad sector doesn't abort the copy.
# * Ends with the image's SHA-256, so every later analysis can prove it worked on an unchanged copy.
# Run in an ADMINISTRATOR PowerShell (raw drive access needs it):
#   powershell -NoProfile -ExecutionPolicy Bypass -File D:\YB-Backups\scripts\IMAGE-USB.ps1 -Drive F

param([string]$Drive = "F", [string]$OutDir = "D:\YB-Backups\recovery",
      [string]$Source, [int]$TestFailEvery = 0)   # last two: for testing only (image a regular file; simulate read errors)
$ErrorActionPreference = "Stop"
$Drive = $Drive.TrimEnd(':', '\').ToUpper()
$Chunk = 1MB; $Small = 4KB

if (-not $Source) {
  $admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $admin) { throw "Run this in an ADMINISTRATOR PowerShell (raw drive access needs it). Nothing was done." }
  if ($OutDir -match "^(?i)$Drive`:") { throw "The image must go to a different drive than $Drive`:. Nothing was done." }
  $part = Get-Partition -DriveLetter $Drive
  $size = [int64]$part.Size
  $vol  = Get-Volume -DriveLetter $Drive
  $label = "$($vol.FileSystem) '$($vol.FileSystemLabel)' disk $($part.DiskNumber), health $($vol.HealthStatus)"
} else { $size = (Get-Item $Source).Length; $label = "test source $Source" }

New-Item -ItemType Directory -Force $OutDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$img = Join-Path $OutDir "usb-$Drive-$stamp.img"; $logf = Join-Path $OutDir "usb-$Drive-$stamp.json"
if (Test-Path $img) { throw "$img already exists. Nothing was done." }
$free = if ($Source) { [int64]::MaxValue } else { (Get-PSDrive ($OutDir.Substring(0, 1))).Free }
if ($free -lt $size * 1.05) { throw ("Not enough free space on {0}: need {1:N1} GB, have {2:N1} GB." -f $OutDir.Substring(0, 2), ($size / 1GB), ($free / 1GB)) }
Write-Host ("Imaging {0}: ({1}), {2:N2} GB -> {3}" -f $Drive, $label, ($size / 1GB), $img) -ForegroundColor Cyan

# Open the source READ-ONLY. .NET Framework's FileStream refuses \\.\X: paths, so the handle comes from CreateFile.
if ($Source) { $in = [IO.File]::Open($Source, 'Open', 'Read', 'ReadWrite') }
else {
  Add-Type -Namespace YB -Name Raw -MemberDefinition @'
[DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
public static extern Microsoft.Win32.SafeHandles.SafeFileHandle CreateFile(string name, uint access, uint share, IntPtr sec, uint disposition, uint flags, IntPtr template);
'@
  $GENERIC_READ = [uint32]2147483648; $SHARE_RW = [uint32]3; $OPEN_EXISTING = [uint32]3
  $h = [YB.Raw]::CreateFile("\\.\$Drive`:", $GENERIC_READ, $SHARE_RW, [IntPtr]::Zero, $OPEN_EXISTING, [uint32]0, [IntPtr]::Zero)
  if ($h.IsInvalid) { throw "Could not open \\.\$Drive`: read-only (Windows error $([Runtime.InteropServices.Marshal]::GetLastWin32Error()))." }
  $in = New-Object IO.FileStream($h, [IO.FileAccess]::Read, 1)
}
$out = [IO.File]::Open($img, 'CreateNew', 'Write', 'None')
$buf = New-Object byte[] $Chunk; $zero = New-Object byte[] $Chunk
$bad = New-Object System.Collections.Generic.List[string]; $badBytes = [int64]0
$t0 = Get-Date; $nextReport = [int64]0
function ReadAt([int64]$off, [int]$len, [byte[]]$into) {
  if ($TestFailEvery -gt 0) {   # testing only: 4 KiB piece number k is "bad" when k % TestFailEvery == 3
    for ($k = [int64][Math]::Floor($off / $Small); $k * $Small -lt $off + $len; $k++) { if (($k % $TestFailEvery) -eq 3) { throw [IO.IOException]"simulated bad sector" } } }
  $in.Position = $off; $got = 0
  while ($got -lt $len) { $n = $in.Read($into, $got, $len - $got); if ($n -le 0) { break }; $got += $n }
  if ($got -ne $len) { throw [IO.IOException]"short read at $off ($got of $len)" }
}
try {
  for ($off = [int64]0; $off -lt $size; $off += $Chunk) {
    $len = [int][Math]::Min($Chunk, $size - $off)
    try { ReadAt $off $len $buf; $out.Write($buf, 0, $len) }
    catch [IO.IOException] {
      for ($s = 0; $s -lt $len; $s += $Small) {            # retry this block in small pieces
        $sl = [int][Math]::Min($Small, $len - $s); $piece = New-Object byte[] $sl
        try { ReadAt ($off + $s) $sl $piece; $out.Write($piece, 0, $sl) }
        catch [IO.IOException] { $out.Write($zero, 0, $sl); $bad.Add("$($off + $s)+$sl"); $badBytes += $sl }
      }
    }
    if ($off -ge $nextReport) {
      $pct = [int](100 * $off / [Math]::Max(1, $size)); $mbps = ($off / 1MB) / [Math]::Max(1, ((Get-Date) - $t0).TotalSeconds)
      Write-Host ("  {0,3}%  {1:N0} MB read  {2:N1} MB/s  unreadable so far: {3:N0} KB" -f $pct, ($off / 1MB), $mbps, ($badBytes / 1KB))
      $nextReport = $off + 256MB
    }
  }
}
finally { $in.Dispose(); $out.Dispose() }
Write-Host "Computing SHA-256 of the image..."
$sha = (Get-FileHash $img -Algorithm SHA256).Hash.ToLower()
$report = [ordered]@{ source = "$Drive`:"; description = $label; bytes = $size; image = $img; sha256 = $sha
  unreadable_bytes = $badBytes; unreadable_ranges = $bad; started = $t0.ToString("s"); finished = (Get-Date).ToString("s") }
$report | ConvertTo-Json -Depth 3 | Set-Content $logf
Write-Host ("DONE. Image {0:N2} GB, unreadable {1:N0} KB in {2} piece(s). SHA-256 {3}" -f ($size / 1GB), ($badBytes / 1KB), $bad.Count, $sha) -ForegroundColor Green
Write-Host "Log: $logf. Do not use F: for anything else until recovery is finished."
