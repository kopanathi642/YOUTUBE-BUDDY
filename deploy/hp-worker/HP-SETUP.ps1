# YouTube Buddy X - HP Victus GPU worker setup, one run (ADMINISTRATOR PowerShell). Needs internet; the ASUS can be OFF.
#  1. checks this is the HP (NVIDIA RTX GPU with driver, >= 30 GB free on C:) - stops otherwise, nothing installed
#  2. installs only what's missing, with winget (official packages): Git, Python 3.11, FFmpeg (full, has NVENC), Tailscale
#     (winget may ask you to accept a package's licence: that's your choice to type Y)
#  3. gets the worker code: git clone https://github.com/kopanathi642/YOUTUBE-BUDDY -> C:\YB-Worker (or git pull if there)
#  4. downloads llama.cpp's official Windows CUDA build (GitHub ggml-org/llama.cpp latest release) -> C:\YB-Worker\llama
#  5. downloads the Qwen3-4B Q4_K_M model (~2.5 GB) and runs one real test generation on the GPU, bound to 127.0.0.1 only
#  6. creates C:\YB-Worker\gpu-worker\worker.local.toml from the example (token left blank - you add it later, never in chat)
# Does NOT sign in to Tailscale, does NOT register with the server, does NOT set up auto-start. Report: C:\YB-Worker\hp-setup-<time>.log
# Run:  powershell -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\Downloads\HP-SETUP.ps1"

param([string]$Dir = "C:\YB-Worker", [switch]$SkipModel)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"            # makes Invoke-WebRequest downloads much faster on PS 5.1
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
New-Item -ItemType Directory -Force $Dir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
Start-Transcript -Path (Join-Path $Dir "hp-setup-$stamp.log") | Out-Null
function Head($t) { Write-Host "`n==== $t ====" -ForegroundColor Cyan }
function Have($c) { [bool](Get-Command $c -ErrorAction SilentlyContinue) }
function RefreshPath { $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User") }
$llama = $null
try {
  $admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $admin) { throw "Run this in an ADMINISTRATOR PowerShell. Nothing was done." }

  Head "1/6 Is this the HP with a working NVIDIA GPU?"
  if (-not (Have "nvidia-smi")) { throw "nvidia-smi not found: install/update the NVIDIA driver (NVIDIA App -> Drivers), restart, run again. Nothing was installed." }
  $gpu = (nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader | Select-Object -First 1).Trim()
  $cudaLine = (nvidia-smi | Select-String "CUDA (?:UMD )?Version:\s*([\d.]+)").Matches[0].Groups[1].Value
  Write-Host "GPU: $gpu | driver supports CUDA $cudaLine | $((Get-CimInstance Win32_Processor).Name.Trim()) | RAM $([math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory/1GB)) GB"
  if ($gpu -notmatch "RTX") { throw "Expected an NVIDIA RTX GPU, found '$gpu'. Stopping." }
  if ([version]$cudaLine -lt [version]"12.4") { throw "NVIDIA driver too old (CUDA $cudaLine, need 12.4+). Update it with the NVIDIA App, restart, run again." }
  $freeGB = [math]::Round((Get-PSDrive C).Free / 1GB)
  if ($freeGB -lt 30) { throw "Only $freeGB GB free on C:, need 30. Stopping." }
  Write-Host "ok ($freeGB GB free on C:)" -ForegroundColor Green

  Head "2/6 Software (only what's missing)"
  if (-not (Have "winget")) { throw "winget not found: install 'App Installer' from the Microsoft Store, then run again." }
  $need = @()
  if (-not (Have "git")) { $need += "Git.Git" }
  $py311 = $false; if (Have "py") { $py311 = [bool]((py -0p | Out-String) -match "3\.1[1-3]") }
  if (-not $py311) { $need += "Python.Python.3.11" }
  if (-not (Have "ffmpeg")) { $need += "Gyan.FFmpeg" }
  if (-not (Have "tailscale") -and -not (Test-Path "C:\Program Files\Tailscale\tailscale.exe")) { $need += "Tailscale.Tailscale" }
  foreach ($id in $need) {
    Write-Host "installing $id ..."
    winget install --id $id --exact --source winget --silent
    if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne -1978335189) { throw "winget could not install $id (code $LASTEXITCODE)." }   # -1978335189 = already installed
  }
  RefreshPath
  if (-not $need) { Write-Host "everything already installed" }
  foreach ($c in "git", "py", "ffmpeg") { if (-not (Have $c)) { throw "$c still not found after install - close this window, open a NEW admin PowerShell and run the script again." } }
  $ErrorActionPreference = "Continue"; $nvenc = [bool]((ffmpeg -hide_banner -encoders 2>&1 | Out-String) -match "h264_nvenc"); $pyv = (py -3 --version 2>&1 | Out-String).Trim(); $ErrorActionPreference = "Stop"
  Write-Host ("Python: {0} | FFmpeg NVENC: {1}" -f $pyv, $nvenc) -ForegroundColor Green

  Head "3/6 Worker code -> $Dir"
  if (Test-Path (Join-Path $Dir ".git")) { git -C $Dir pull --ff-only; if ($LASTEXITCODE) { throw "git pull failed" } }
  else {
    $tmp = "$Dir-clone-$stamp"; git clone --depth 1 https://github.com/kopanathi642/YOUTUBE-BUDDY.git $tmp
    if ($LASTEXITCODE) { throw "git clone failed" }
    Get-ChildItem -Force $tmp | Move-Item -Destination $Dir; Remove-Item $tmp
  }
  py -3 -m py_compile (Join-Path $Dir "gpu-worker\worker.py"); if ($LASTEXITCODE) { throw "worker.py does not compile with this Python" }
  Write-Host "code at $Dir (commit $((git -C $Dir rev-parse --short HEAD).Trim()))" -ForegroundColor Green

  Head "4/6 llama.cpp (official Windows CUDA build)"
  $ldir = Join-Path $Dir "llama"; $exe = Join-Path $ldir "llama-server.exe"
  if (Test-Path $exe) { Write-Host "already there: $exe" }
  else {
    # "latest" can be a nightly-tag-only release; the Windows builds are in the numbered bNNNNN (pre-)releases
    $rels = Invoke-RestMethod "https://api.github.com/repos/ggml-org/llama.cpp/releases?per_page=30" -Headers @{ "User-Agent" = "yb-hp-setup" }
    $rel = $null; $bin = $null
    foreach ($r in $rels) { $b = $r.assets | Where-Object name -match '^llama-.*-bin-win-cuda-12\.\d+-x64\.zip$' | Select-Object -First 1; if ($b) { $rel = $r; $bin = $b; break } }
    if (-not $bin) { throw "No Windows CUDA 12 build found in the last 30 llama.cpp releases." }
    $cver = [regex]::Match($bin.name, 'cuda-(12\.\d+)').Groups[1].Value
    $rt = $rel.assets | Where-Object name -match "^cudart-llama-bin-win-cuda-$([regex]::Escape($cver))-x64\.zip$" | Select-Object -First 1
    New-Item -ItemType Directory -Force $ldir | Out-Null
    foreach ($a in @($bin, $rt) | Where-Object { $_ }) {
      $zip = Join-Path $env:TEMP $a.name
      Write-Host "downloading $($a.name) ($([math]::Round($a.size/1MB)) MB) from github.com/ggml-org/llama.cpp ..."
      Invoke-WebRequest $a.browser_download_url -OutFile $zip -UseBasicParsing
      Expand-Archive $zip -DestinationPath $ldir -Force; Remove-Item $zip
    }
    $found = Get-ChildItem $ldir -Recurse -Filter llama-server.exe | Select-Object -First 1
    if (-not $found) { throw "llama-server.exe not found after unzip" }
    if ($found.DirectoryName -ne $ldir) { Get-ChildItem $found.DirectoryName | Move-Item -Destination $ldir -Force }
    Write-Host "llama.cpp $($rel.tag_name) (CUDA $cver) installed" -ForegroundColor Green
  }
  $start = Join-Path $Dir "start-llm.cmd"
  Set-Content $start -Encoding ascii -Value "@echo off`r`nrem Writing model for the GPU worker. Listens on 127.0.0.1 only (not reachable from the network).`r`n`"$exe`" -hf Qwen/Qwen3-4B-GGUF:Q4_K_M --host 127.0.0.1 --port 8080 -ngl 99 -c 6144 --jinja"

  Head "5/6 Model download + real GPU test"
  if ($SkipModel) { Write-Host "skipped (-SkipModel)" }
  else {
    $logOut = Join-Path $Dir "llama-test-$stamp.log"
    $llama = Start-Process -FilePath $exe -ArgumentList "-hf Qwen/Qwen3-4B-GGUF:Q4_K_M --host 127.0.0.1 --port 8080 -ngl 99 -c 6144 --jinja" -RedirectStandardError $logOut -RedirectStandardOutput "$logOut.out" -WindowStyle Hidden -PassThru
    Write-Host "downloading the model (~2.5 GB, first time only) and loading it on the GPU ... (log: $logOut)"
    $ready = $false; $t0 = Get-Date
    while (-not $ready -and ((Get-Date) - $t0).TotalMinutes -lt 45) {
      Start-Sleep 10
      if ($llama.HasExited) { throw "llama-server stopped. Last log lines:`n$((Get-Content $logOut -Tail 15) -join "`n")" }
      try { $ready = (Invoke-WebRequest "http://127.0.0.1:8080/health" -UseBasicParsing -TimeoutSec 5).StatusCode -eq 200 } catch { }
      if (-not $ready) { Write-Host ("  {0:N0} min ..." -f ((Get-Date) - $t0).TotalMinutes) }
    }
    if (-not $ready) { throw "model not ready after 45 minutes (slow internet?). Run the script again; the download resumes." }
    $body = @{ messages = @(@{ role = "system"; content = "Reply with JSON only." }, @{ role = "user"; content = 'Give 3 YouTube video title ideas about cooking dal, as {"titles": [...]}' });
               temperature = 0.4; max_tokens = 300; response_format = @{ type = "json_object" }; chat_template_kwargs = @{ enable_thinking = $false } } | ConvertTo-Json -Depth 6
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $r = Invoke-RestMethod "http://127.0.0.1:8080/v1/chat/completions" -Method Post -ContentType "application/json" -Body $body -TimeoutSec 300
    $sw.Stop()
    $txt = $r.choices[0].message.content
    $null = $txt | ConvertFrom-Json        # throws if the answer is not valid JSON
    $tps = if ($r.timings.predicted_per_second) { "{0:N1} tokens/s" -f $r.timings.predicted_per_second } else { "" }
    $vram = (nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader).Trim()
    Write-Host "test answer (valid JSON): $txt" -ForegroundColor Green
    Write-Host ("took {0:N1} s {1} | GPU memory in use: {2}" -f $sw.Elapsed.TotalSeconds, $tps, $vram) -ForegroundColor Green
    Stop-Process -Id $llama.Id -Force; $llama = $null
  }

  Head "6/6 Worker config file"
  $cfg = Join-Path $Dir "gpu-worker\worker.local.toml"
  if (Test-Path $cfg) { Write-Host "already exists - left unchanged: $cfg" }
  else { Copy-Item (Join-Path $Dir "gpu-worker\worker.local.toml.example") $cfg; Write-Host "created $cfg (token still blank - added after the ASUS is back and the worker is registered)" }

  Write-Host "`nHP SETUP DONE." -ForegroundColor Green
  Write-Host "Next, when the ASUS is on: open Tailscale (system tray) and sign in yourself, on BOTH laptops, with the same account."
}
catch { Write-Host "`nSTOPPED: $($_.Exception.Message)" -ForegroundColor Red; if ($llama -and -not $llama.HasExited) { Stop-Process -Id $llama.Id -Force }; Stop-Transcript | Out-Null; exit 1 }
Stop-Transcript | Out-Null
