$ErrorActionPreference = 'Stop'
$workspace = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
Set-Location -LiteralPath $workspace
New-Item -ItemType Directory -Force -Path '.local\downloads' | Out-Null
# Reviewed primary binaries only. Never execute a downloaded installation script.
$pgArchive = Join-Path $workspace '.local\downloads\postgresql-17.11-3-windows-x64-binaries.zip'
$pgHash = '4b8db0930c38f6ef845db919551dedda3b6b845aeb0927b3d79a6e8e9e4537cf'
if (!(Test-Path -LiteralPath $pgArchive)) { Invoke-WebRequest -Uri 'https://get.enterprisedb.com/postgresql/postgresql-17.11-3-windows-x64-binaries.zip' -OutFile $pgArchive }
if ((Get-FileHash -LiteralPath $pgArchive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $pgHash) { throw 'Official PostgreSQL archive checksum mismatch. Do not execute.' }
$pgTarget = Join-Path $workspace '.local\postgres'
if (!(Test-Path -LiteralPath (Join-Path $pgTarget 'pgsql\bin\postgres.exe'))) { Expand-Archive -LiteralPath $pgArchive -DestinationPath $pgTarget }
$memuraiArchive = Join-Path $workspace '.local\downloads\Memurai-Developer-v4.3.2.msi'
$memuraiHash = '5642cbe181d6a2dbce97300f44b5d58505bf592fc2879d75852a792dda946100'
if (!(Test-Path -LiteralPath $memuraiArchive)) {
  $link = Invoke-RestMethod -Uri 'https://www.memurai.com/api/request-download-link?version=windows-valkey'
  $downloadUri = [Uri]$link.url
  if ($downloadUri.Scheme -ne 'https' -or $downloadUri.Host -ne 'download.memurai.com' -or $downloadUri.AbsolutePath -ne '/Memurai-Developer/4.3.2/Memurai-Developer-v4.3.2.msi') { throw 'Official Memurai version changed; review new stable binary before updating pin.' }
  Invoke-WebRequest -Uri $link.url -OutFile $memuraiArchive
}
if ((Get-FileHash -LiteralPath $memuraiArchive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $memuraiHash) { throw 'Memurai recorded checksum mismatch. Do not execute.' }
$signature = Get-AuthenticodeSignature -LiteralPath $memuraiArchive
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Janea Systems, Inc') { throw 'Memurai publisher signature failed. Do not execute.' }
$memuraiTarget = Join-Path $workspace '.local\memurai-stable'
if (!(Test-Path -LiteralPath (Join-Path $memuraiTarget 'Memurai\memurai.exe'))) {
  $process = Start-Process -FilePath msiexec.exe -ArgumentList @('/a',('"'+$memuraiArchive+'"'),'/qn',('TARGETDIR="'+$memuraiTarget+'"')) -WindowStyle Hidden -PassThru
  $process.WaitForExit()
  if ($process.ExitCode -ne 0) { throw 'Memurai administrative extraction failed.' }
}
Write-Output 'Verified pinned native development binaries extracted only. No service, firewall, PATH or system database changes.'
Write-Output 'Memurai developer license permits development/test only, includes telemetry and a 10-day restart timer. Read .local/memurai-stable/Memurai/Memurai-Developer-EULA.rtf before use.'
