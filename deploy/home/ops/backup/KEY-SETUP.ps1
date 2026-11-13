# YouTube Buddy X - one-time backup key setup (FOR APPROVAL - not yet run). You run it yourself, at the keyboard.
# Creates an encryption key pair for the backups:
#   * PUBLIC key  -> stays on this laptop in D:\YB-Backups\keys\gnupg (it can lock backups, never unlock them)
#   * PRIVATE key -> written ONLY to the path you give (your USB stick), protected by your passphrase, then deleted
#                    from this laptop. Only the private key + passphrase can open the encrypted backups.
# The passphrase is typed into a hidden prompt, held in memory for this run only, passed to gpg through its input
# stream (never on the command line, never written to disk), and is not shown or logged.
# Usage:  powershell -ExecutionPolicy Bypass -File KEY-SETUP.ps1 -PrivateKeyOut F:\yb-backup-private.asc

param([Parameter(Mandatory)][string]$PrivateKeyOut, [string]$Root = "D:\YB-Backups", [string]$KeyId = "YouTube Buddy Backup",
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
if ($PrivateKeyOut -notmatch '^[A-Za-z]:[\\/]' -and -not [IO.Path]::IsPathRooted($PrivateKeyOut)) { $PrivateKeyOut = Join-Path (Get-Location).ProviderPath $PrivateKeyOut }
$KeyDir = Join-Path $Root "keys\gnupg"; $GpgHome = MsysPath $KeyDir
$TempBase = if ($env:TEMP) { $env:TEMP } else { [IO.Path]::GetTempPath() }
$Tmp = Join-Path $TempBase ("ybk" + [guid]::NewGuid().ToString("N").Substring(0, 8)); $TmpHome = MsysPath $Tmp
function Ok($what) { if ($LASTEXITCODE -ne 0) { throw "$what failed (exit code $LASTEXITCODE)" } }
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
function Plain($s) { [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)) }

if (Test-Path (Join-Path $KeyDir "pubring.kbx")) { throw "A backup keyring already exists in $KeyDir. Not overwriting it." }
if (Test-Path $PrivateKeyOut) { throw "$PrivateKeyOut already exists. Not overwriting it." }
if ($PrivateKeyOut -match '^(?i)[CDE]:') { Write-Warning "$PrivateKeyOut is on this laptop. Move it to a USB stick or another device afterwards; keeping it here defeats the purpose." }

if ($Passphrase) { $p1 = $Passphrase; $p2 = $Passphrase } else {
  $p1 = Read-Host "Choose a backup passphrase (at least 12 characters; write it on paper)" -AsSecureString
  $p2 = Read-Host "Type it again" -AsSecureString }
$pp = Plain $p1
if ($pp -ne (Plain $p2)) { throw "The two passphrases differ. Nothing was created." }
if ($pp.Length -lt 12) { throw "Passphrase shorter than 12 characters. Nothing was created." }
try {
  New-Item -ItemType Directory -Force $KeyDir, $Tmp | Out-Null
  # 1. create the key pair (encryption only, no expiry) in the backup keyring
  GpgPass $Gpg "--homedir `"$GpgHome`" --batch --pinentry-mode loopback --passphrase-fd 0 --quick-generate-key `"$KeyId`" rsa4096 encr never" $pp | Out-Null; Ok "create key"
  $fpr = ((& $Gpg --homedir $GpgHome --with-colons --list-secret-keys $KeyId) | Where-Object { $_ -like "fpr:*" } | Select-Object -First 1).Split(':')[9]
  # 2. export public key (kept here) and private key (to your USB path) - --output BEFORE the command, never PowerShell '>'
  & $Gpg --homedir $GpgHome --armor --output (MsysPath (Join-Path $Root "keys\backup-public.asc")) --export $fpr; Ok "export public key"
  GpgPass $Gpg "--homedir `"$GpgHome`" --batch --pinentry-mode loopback --passphrase-fd 0 --armor --output `"$(MsysPath $PrivateKeyOut)`" --export-secret-keys $fpr" $pp | Out-Null; Ok "export private key"
  # 3. prove the private key file works BEFORE removing the key from this laptop: encrypt a test text, decrypt it with
  #    only the exported private key in a temporary keyring
  $probe = "yb-key-check-" + [guid]::NewGuid().ToString("N")
  $enc = Join-Path $Tmp "probe.gpg"
  $probe | & $Gpg --homedir $GpgHome --batch --yes --trust-model always --recipient $fpr --output (MsysPath $enc) --encrypt; Ok "test encrypt"
  New-Item -ItemType Directory -Force $Tmp | Out-Null
  GpgPass $Gpg "--homedir `"$TmpHome`" --batch --pinentry-mode loopback --passphrase-fd 0 --import `"$(MsysPath $PrivateKeyOut)`"" $pp | Out-Null; Ok "test import of the exported private key"
  $back = GpgPass $Gpg "--homedir `"$TmpHome`" --batch --pinentry-mode loopback --passphrase-fd 0 --decrypt `"$(MsysPath $enc)`"" $pp; Ok "test decrypt"
  if ("$back".Trim() -ne $probe) { throw "Round-trip check failed: the exported private key could not decrypt. The key was NOT removed from this laptop." }
  # 4. the private key leaves this laptop: delete it from the backup keyring (public key stays)
  & $Gpg --homedir $GpgHome --batch --yes --delete-secret-keys $fpr; Ok "remove private key from this laptop"
  $left = & $Gpg --homedir $GpgHome --list-secret-keys
  if ($left) { throw "A private key is still in $KeyDir" }
  "Fingerprint: $fpr`nCreated: $(Get-Date -Format s)`nPrivate key exported to: $PrivateKeyOut" | Set-Content (Join-Path $Root "keys\FINGERPRINT.txt")
  Write-Host "OK. Fingerprint $fpr. Public key: $Root\keys\backup-public.asc. Private key: $PrivateKeyOut (verified)."
  Write-Host "Now: copy $PrivateKeyOut to a SECOND safe place, and store the passphrase on paper. Losing both = backups unrecoverable."
}
finally {
  $pp = $null
  & $GpgConf --homedir $GpgHome --kill gpg-agent
  if (Test-Path $Tmp) { & $GpgConf --homedir $TmpHome --kill gpg-agent; Remove-Item $Tmp -Recurse -Force }
}
