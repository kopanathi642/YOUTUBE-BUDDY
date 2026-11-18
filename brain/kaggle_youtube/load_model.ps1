# load_model.ps1 — Import trained Buddy Brain GGUF into Ollama on HP
# Run this on the HP after downloading buddy_brain_youtube_outputs.zip from Kaggle.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File brain\kaggle_youtube\load_model.ps1
#
# Prerequisites:
#   1. Ollama installed (already done)
#   2. Downloaded buddy_brain_youtube_outputs.zip from Kaggle Output tab
#   3. Extracted it to brain\incoming\youtube\ in this repo

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

Write-Host "=== Buddy Brain Model Loader ===" -ForegroundColor Cyan
Write-Host "Repo: $RepoRoot"

# Check GGUF file exists
$GgufDir  = Join-Path $RepoRoot "brain\incoming\youtube\buddy-brain-yt-v1-gguf"
$GgufFile = Get-ChildItem $GgufDir -Filter "*.gguf" -ErrorAction SilentlyContinue | Select-Object -First 1

if (-not $GgufFile) {
    Write-Host @"

STOPPED: GGUF file not found at:
  $GgufDir

Steps to fix:
  1. Go to your Kaggle notebook Output tab
  2. Download buddy_brain_youtube_outputs.zip
  3. Extract it to: $RepoRoot\brain\incoming\youtube\
  4. Run this script again.

"@ -ForegroundColor Red
    exit 1
}

Write-Host "GGUF found: $($GgufFile.FullName) ($([math]::Round($GgufFile.Length/1MB)) MB)" -ForegroundColor Green

# Update Modelfile path to absolute
$ModelfileSrc  = Join-Path $PSScriptRoot "Modelfile"
$ModelfileTmp  = Join-Path $env:TEMP "BuddyBrainModelfile"
$ModelfileContent = Get-Content $ModelfileSrc -Raw
$ModelfileContent = $ModelfileContent -replace "FROM \./brain/incoming/youtube/buddy-brain-yt-v1-gguf/unsloth\.Q4_K_M\.gguf", "FROM `"$($GgufFile.FullName.Replace('\','/'))`""
Set-Content $ModelfileTmp $ModelfileContent -Encoding utf8

Write-Host "Creating Ollama model 'buddy-brain' ..." -ForegroundColor Cyan
ollama create buddy-brain -f $ModelfileTmp
if ($LASTEXITCODE -ne 0) {
    Write-Host "FAILED (exit $LASTEXITCODE)" -ForegroundColor Red
    exit 1
}

Write-Host "Model created. Running quick test ..." -ForegroundColor Cyan
$TestPrompt = 'Create YouTube content for: Niche: cooking, Keywords: dal recipe 10 minutes easy, Channel type: food'
$result = echo $TestPrompt | ollama run buddy-brain
Write-Host "Test output:" -ForegroundColor Yellow
Write-Host $result

# Validate JSON
try {
    $null = $result | ConvertFrom-Json
    Write-Host "`n SUCCESS: buddy-brain returns valid JSON" -ForegroundColor Green
} catch {
    Write-Host "`n WARNING: Output is not valid JSON (may need more training data)" -ForegroundColor Yellow
}

Write-Host @"

Done! buddy-brain is now available in Ollama.
To use it: ollama run buddy-brain
To use it in the GPU worker: set llm_model = "buddy-brain" in gpu-worker\worker.local.toml
"@ -ForegroundColor Green

Remove-Item $ModelfileTmp -ErrorAction SilentlyContinue
