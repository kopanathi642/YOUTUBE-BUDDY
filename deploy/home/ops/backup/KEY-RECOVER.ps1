# YouTube Buddy X - finish setting up an EXISTING backup key after KEY-SETUP stopped part-way (FOR APPROVAL).
# Does NOT create a key and does NOT overwrite any file. In order, stopping at the first failure:
#   1. checks the private key file (on your USB stick) contains the expected fingerprint (read-only, no import)
#   2. checks D:\YB-Backups\keys\gnupg holds the PUBLIC key with that fingerprint, and backup-public.asc matches
#   3. encrypts a test text with the laptop's public keyring (exactly what the nightly backup does)
#   4. decrypts it using ONLY the USB private key, imported into a temporary key folder, with your passphrase
#   5. only if 4 succeeded: deletes the PRIVATE key from D:\YB-Backups\keys\gnupg (the public key stays) and proves
#      that encryption for the nightly backup still works with the public key alone
#   6. writes D:\YB-Backups\keys\FINGERPRINT.txt (only if it does not exist yet)
# Your USB file is only read. The passphrase is typed into a hidden prompt and passed to gpg on its input stream.
# Usage: powershell -ExecutionPolicy Bypass -File KEY-RECOVER.ps1 -PrivateKey "F:\backup key\yb-backup-private-recovered.asc" -Fingerprint 7A1A27AF791C7548C8B83B1CA816C730BDAA891B

param([Parameter(Mandatory)][string]$PrivateKey, [Parameter(Mandatory)][string]$Fingerprint, [string]$Root = "D:\YB-Backups",
      [string]$Gpg = "C:\Program Files\Git\usr\bin\gpg.exe", [string]$GpgConf = "C:\Program Files\Git\usr\bin\gpgconf.exe",
      [SecureString]$Passphrase)   # last three: for testing only; leave them out on the laptop
$ErrorActionPreference = "Stop"
function MsysPath([string]$p) {
  # Path for Git for Windows' gpg (an MSYS program): it understands /d/YB-Backups/..., NOT D:/YB-Backups/... (it would treat
  # that as a folder inside the current directory). Relative paths are made absolute first.
  if ($p -match '^([A-Za-z]):[\\/](.*)$') { return '/' + $Matches[1].ToLower() + '/' + ($Matches[2] -replace '\\', '/') }
  if (-not [IO.Path]::IsPathRooted($p)) { return MsysPath (Join-Path (Get-Location).ProviderPath $p) }
  return ($p -replace '\\', '/')
}
function GpgPass([string]$exe, [string]$arguments, [string]$pp) {
  # Runs a program and gives it the passphrase on standard input ending in a bare LF. PowerShell's own piping would
  # append CR+LF on Windows, and gpg would keep the CR as part of the passphrase, so a hand-typed passphrase would never match.
  $psi = New-Object System.Diagnostics.ProcessStartInfo $exe, $arguments
  $psi.UseShellExecute = $false; $psi.RedirectStandardInput = $true; $psi.RedirectStandardOutput = $true
  $p = [System.Diagnostics.Process]::Start($psi)
  $p.StandardInput.Write($pp + "`n"); $p.StandardInput.Close()
  $out = $p.StandardOutput.ReadToEnd(); $p.WaitForExit(); $global:LASTEXITCODE = $p.ExitCode
  return $out
}
function Ok($what) { if ($LASTEXITCODE -ne 0) { throw "$what failed (exit code $LASTEXITCODE)" } }
function Step($n, $text) { Write-Host ("[{0}] {1}" -f $n, $text) -ForegroundColor Cyan }
function Fprs($lines) { @($lines | Where-Object { $_ -like "fpr:*" } | ForEach-Object { $_.Split(':')[9] }) }

$Fingerprint = $Fingerprint.Replace(" ", "").ToUpper()
$KeyDir   = Join-Path $Root "keys\gnupg"; $GpgHome = MsysPath $KeyDir
$PubFile  = Join-Path $Root "keys\backup-public.asc"
$FprFile  = Join-Path $Root "keys\FINGERPRINT.txt"
$TempBase = if ($env:TEMP) { $env:TEMP } else { [IO.Path]::GetTempPath() }
$Tmp      = Join-Path $TempBase ("ybv" + [guid]::NewGuid().ToString("N").Substring(0, 8)); $TmpHome = MsysPath $Tmp
$pp = $null
try {
  New-Item -ItemType Directory -Force $Tmp | Out-Null
  $Show = Join-Path $Tmp "s"; New-Item -ItemType Directory -Force $Show | Out-Null; $ShowHome = MsysPath $Show   # scratch keyring for read-only inspection
  Step 1 "Private key file contains fingerprint $($Fingerprint)?"
  if (!(Test-Path $PrivateKey)) { throw "Not found: $PrivateKey" }
  $f = @(Fprs (& $Gpg --homedir $ShowHome --batch --with-colons --show-keys (MsysPath $PrivateKey))); Ok "read key file"
  if ($f[0] -ne $Fingerprint) { throw "The file's primary key is $($f[0]), not $Fingerprint. Stopping; nothing changed." }
  Write-Host "    yes ($((Get-Item $PrivateKey).Length) bytes)"

  Step 2 "Laptop keyring + backup-public.asc hold the PUBLIC key $($Fingerprint)?"
  $pub = @(Fprs (& $Gpg --homedir $GpgHome --batch --with-colons --list-keys $Fingerprint)); Ok "find public key in $KeyDir"
  if ($pub[0] -ne $Fingerprint) { throw "Public key $Fingerprint not found in $KeyDir. Stopping; nothing changed." }
  $pf = @(Fprs (& $Gpg --homedir $ShowHome --batch --with-colons --show-keys (MsysPath $PubFile))); Ok "read backup-public.asc"
  if ($pf[0] -ne $Fingerprint) { throw "backup-public.asc holds $($pf[0]), not $Fingerprint. Stopping; nothing changed." }
  $secHere = @(Fprs (& $Gpg --homedir $GpgHome --batch --with-colons --list-secret-keys))
  Write-Host ("    yes. Private key currently on this laptop: {0}" -f $(if ($secHere -contains $Fingerprint) { "YES (will be removed after the test)" } else { "no" }))

  Step 3 "Encrypt a test text with the laptop's public keyring (as the nightly backup does)"
  $probe = "yb-key-check-" + [guid]::NewGuid().ToString("N")
  $plainFile = Join-Path $Tmp "probe.txt"; $encFile = Join-Path $Tmp "probe.gpg"
  [IO.File]::WriteAllText($plainFile, $probe)
  & $Gpg --homedir $GpgHome --batch --yes --trust-model always --recipient $Fingerprint --output (MsysPath $encFile) --encrypt (MsysPath $plainFile); Ok "test encrypt"
  Write-Host "    encrypted ($((Get-Item $encFile).Length) bytes)"

  Step 4 "Decrypt it using ONLY the USB private key (temporary key folder)"
  $sec = if ($Passphrase) { $Passphrase } else { Read-Host "Backup key passphrase" -AsSecureString }
  $pp = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
  $tmpKeys = Join-Path $Tmp "k"; New-Item -ItemType Directory -Force $tmpKeys | Out-Null; $TmpKeyHome = MsysPath $tmpKeys
  GpgPass $Gpg "--homedir `"$TmpKeyHome`" --batch --pinentry-mode loopback --passphrase-fd 0 --import `"$(MsysPath $PrivateKey)`"" $pp | Out-Null; Ok "import USB private key into the temporary folder"
  $back = GpgPass $Gpg "--homedir `"$TmpKeyHome`" --batch --pinentry-mode loopback --passphrase-fd 0 --decrypt `"$(MsysPath $encFile)`"" $pp; Ok "decrypt with the USB key (wrong passphrase stops here)"
  $pp = $null
  if ("$back".Trim() -ne $probe) { throw "Decrypted text does not match. Stopping; the laptop's private key was NOT removed." }
  Write-Host "    decrypted correctly: the USB key + your passphrase can open the backups" -ForegroundColor Green

  Step 5 "Remove the PRIVATE key from this laptop (public key stays)"
  if ($secHere -contains $Fingerprint) {
    & $Gpg --homedir $GpgHome --batch --yes --delete-secret-keys $Fingerprint; Ok "delete private key from $KeyDir"
  }
  $left = @(Fprs (& $Gpg --homedir $GpgHome --batch --with-colons --list-secret-keys))
  if ($left) { throw "A private key is still in $KeyDir ($($left -join ', '))" }
  $pub2 = @(Fprs (& $Gpg --homedir $GpgHome --batch --with-colons --list-keys $Fingerprint)); Ok "public key still present"
  if ($pub2[0] -ne $Fingerprint) { throw "Public key missing after removal - stop and report this" }
  $enc2 = Join-Path $Tmp "probe2.gpg"
  & $Gpg --homedir $GpgHome --batch --yes --trust-model always --recipient $Fingerprint --output (MsysPath $enc2) --encrypt (MsysPath $plainFile); Ok "encrypt with the public key only"
  Write-Host "    checking the laptop can NO longer decrypt (a gpg 'No secret key' message here is the expected result):"
  GpgPass $Gpg "--homedir `"$GpgHome`" --batch --pinentry-mode loopback --passphrase-fd 0 --decrypt `"$(MsysPath $enc2)`"" "" | Out-Null
  if ($LASTEXITCODE -eq 0) { throw "This laptop could still decrypt - private key not fully removed" }
  $global:LASTEXITCODE = 0
  Write-Host "    private key removed; public key present; nightly encryption works; this laptop can no longer decrypt" -ForegroundColor Green

  Step 6 "Record the fingerprint"
  if (Test-Path $FprFile) { Write-Host "    $FprFile already exists - left unchanged" }
  else { "Fingerprint: $Fingerprint`nRecovered and verified: $(Get-Date -Format s)`nPrivate key copy: $PrivateKey" | Set-Content $FprFile; Write-Host "    written: $FprFile" }
  Write-Host "KEY RECOVERY COMPLETE. Keep the USB file + a second copy + the passphrase on paper." -ForegroundColor Green
}
catch { Write-Host "STOPPED: $($_.Exception.Message)" -ForegroundColor Red; exit 1 }
finally {
  $pp = $null
  & $GpgConf --homedir $GpgHome --kill gpg-agent
  if (Test-Path $Tmp) { foreach ($h in "k", "s") { if (Test-Path (Join-Path $Tmp $h)) { & $GpgConf --homedir (MsysPath (Join-Path $Tmp $h)) --kill gpg-agent } }; Remove-Item $Tmp -Recurse -Force }
}
