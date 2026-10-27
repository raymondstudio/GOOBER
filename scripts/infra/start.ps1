$ErrorActionPreference = 'Stop'
$workspace = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
Set-Location -LiteralPath $workspace
New-Item -ItemType Directory -Force -Path '.local' | Out-Null
try { $startLock = [System.IO.File]::Open((Join-Path $workspace '.local\infra-start.lock'), [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None) } catch { throw 'Another infrastructure start is in progress. Let it finish before retrying.' }
try {
if (!(Test-Path -LiteralPath '.env')) { throw 'Run pnpm setup:local first.' }
$settings = @{}
foreach ($line in Get-Content -LiteralPath '.env') { if ($line -match '^([A-Z_]+)=(.*)$') { $settings[$matches[1]] = $matches[2] } }
if ($settings.APP_ENV -notin @('local','test') -or $settings.DATA_ENV -ne 'test') { throw 'Native infrastructure is isolated-local only.' }
$runtimeUri = [Uri]$settings.DATABASE_URL
$migratorUri = [Uri]$settings.DIRECT_DATABASE_URL
if ($runtimeUri.Host -notin @('127.0.0.1','localhost') -or $migratorUri.Host -notin @('127.0.0.1','localhost') -or $runtimeUri.Port -ne 54329) { throw 'Refusing nonlocal database setup.' }
$pgBin = Join-Path $workspace '.local\postgres\pgsql\bin'
$redisBin = Join-Path $workspace '.local\memurai-stable\Memurai'
if (!(Test-Path -LiteralPath (Join-Path $pgBin 'initdb.exe'))) { throw 'Install verified PostgreSQL binaries as documented in docs/platform-preparation.md.' }
$redisExe = Get-ChildItem -LiteralPath (Join-Path $workspace '.local\memurai-stable') -Filter 'memurai.exe' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
if (!$redisExe) { throw 'Install official signed Memurai binaries as documented in docs/platform-preparation.md, or run Docker Compose.' }
$pgData = Join-Path $workspace '.local\data\postgres'
$redisData = Join-Path $workspace '.local\data\redis-stable'
New-Item -ItemType Directory -Force -Path $pgData,$redisData | Out-Null
$bootstrapPasswordPath = Join-Path $workspace '.local\postgres-bootstrap-password'
if (!(Test-Path -LiteralPath $bootstrapPasswordPath)) { [System.IO.File]::WriteAllText($bootstrapPasswordPath, [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')) }
if (!(Test-Path -LiteralPath (Join-Path $pgData 'PG_VERSION'))) {
  & (Join-Path $pgBin 'initdb.exe') '-D' $pgData '-U' 'goober_bootstrap' '--pwfile' $bootstrapPasswordPath '--auth=scram-sha-256' '--encoding=UTF8' '--locale=C'
  if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL initdb failed.' }
}
$ErrorActionPreference = 'Continue'
& (Join-Path $pgBin 'pg_ctl.exe') '-D' $pgData 'status' *> $null
$pgStatus = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
if ($pgStatus -ne 0) {
  $pgArgs = @('-D', ('"' + $pgData + '"'), '-l', ('"' + (Join-Path $workspace '.local\postgres.log') + '"'), '-o', '"-h 127.0.0.1 -p 54329"', '-t', '300', '-w', 'start')
  $pgStart = Start-Process -FilePath (Join-Path $pgBin 'pg_ctl.exe') -ArgumentList $pgArgs -WindowStyle Hidden -PassThru
  $pgStart.WaitForExit()
  if ($pgStart.ExitCode -ne 0) { throw 'PostgreSQL startup failed; inspect ignored .local/postgres.log.' }
}
# A preserved cluster may still be replaying WAL/fsyncing after an interrupted laptop session.
# pg_ctl status means the process exists, not that it accepts connections. Never reset its data.
$pgReady = $false
$recoveryWait = [System.Diagnostics.Stopwatch]::StartNew()
$nextRecoveryNotice = 0
while ($recoveryWait.Elapsed.TotalSeconds -lt 300) {
  $ErrorActionPreference = 'Continue'
  & (Join-Path $pgBin 'pg_isready.exe') '-h' '127.0.0.1' '-p' '54329' '-t' '1' *> $null
  $readyExit = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  if ($readyExit -eq 0) { $pgReady = $true; break }
  if ($recoveryWait.Elapsed.TotalSeconds -ge $nextRecoveryNotice) {
    Write-Output 'Waiting for preserved local PostgreSQL recovery; data is unchanged.'
    $nextRecoveryNotice = $recoveryWait.Elapsed.TotalSeconds + 15
  }
  Start-Sleep -Seconds 1
}
if (!$pgReady) { throw 'PostgreSQL did not become ready within five minutes; preserve data and inspect .local/postgres.log.' }
$runtimeParts = $runtimeUri.UserInfo.Split(':',2)
$migratorParts = $migratorUri.UserInfo.Split(':',2)
if ($runtimeParts[0] -ne 'goober_runtime' -or $migratorParts[0] -ne 'goober_migrator' -or $runtimeParts[1] -notmatch '^[a-f0-9]{64}$' -or $migratorParts[1] -notmatch '^[a-f0-9]{64}$') { throw 'Unexpected local role credentials; refusing SQL bootstrap.' }
$bootstrapSql = Join-Path $workspace '.local\bootstrap.sql'
$sql = "SELECT 'CREATE ROLE goober_migrator LOGIN PASSWORD ''" + $migratorParts[1] + "'' NOSUPERUSER NOCREATEDB NOCREATEROLE' WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='goober_migrator')\gexec`n"
$sql += "SELECT 'CREATE ROLE goober_runtime LOGIN PASSWORD ''" + $runtimeParts[1] + "'' NOSUPERUSER NOCREATEDB NOCREATEROLE' WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='goober_runtime')\gexec`n"
$sql += "SELECT 'CREATE DATABASE goober OWNER goober_migrator' WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname='goober')\gexec`n"
$sql += "\connect goober`nGRANT CONNECT ON DATABASE goober TO goober_runtime;`nGRANT USAGE ON SCHEMA public TO goober_runtime;`nALTER DEFAULT PRIVILEGES FOR ROLE goober_migrator IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO goober_runtime;`n"
[System.IO.File]::WriteAllText($bootstrapSql, $sql)
$env:PGPASSWORD = Get-Content -Raw -LiteralPath $bootstrapPasswordPath
try { & (Join-Path $pgBin 'psql.exe') '-h' '127.0.0.1' '-p' '54329' '-U' 'goober_bootstrap' '-d' 'postgres' '-v' 'ON_ERROR_STOP=1' '-f' $bootstrapSql; if ($LASTEXITCODE -ne 0) { throw 'Role bootstrap failed.' } }
finally { Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue; Remove-Item -LiteralPath $bootstrapSql -Force }
$redisConf = Join-Path $workspace '.local\memurai.conf'
$normalizedRedisData = $redisData.Replace('\','/')
$conf = "bind 127.0.0.1`nprotected-mode yes`nport 6389`ndir `"$normalizedRedisData`"`nappendonly yes`nmaxmemory-policy noeviction`nlogfile `"$($workspace.Replace('\','/'))/.local/memurai.log`"`n"
[System.IO.File]::WriteAllText($redisConf, $conf)
$redisCli = Join-Path (Split-Path -Parent $redisExe) 'memurai-cli.exe'
$ErrorActionPreference = 'Continue'
& $redisCli '-h' '127.0.0.1' '-p' '6389' 'ping' 2>$null | Out-Null
$redisExit = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
if ($redisExit -ne 0) { Start-Process -FilePath $redisExe -ArgumentList ('"' + $redisConf + '"') -WindowStyle Hidden | Out-Null }
$redisReady = $false
for ($attempt = 0; $attempt -lt 20; $attempt++) {
  $ErrorActionPreference = 'Continue'
  $answer = & $redisCli '-h' '127.0.0.1' '-p' '6389' 'ping' 2>$null
  $ErrorActionPreference = 'Stop'
  if ($answer -eq 'PONG') { $redisReady = $true; break }
  Start-Sleep -Milliseconds 250
}
if (!$redisReady) { throw 'Memurai did not become ready; inspect ignored .local/memurai.log.' }
Write-Output 'Local PostgreSQL on 127.0.0.1:54329 and Memurai on 127.0.0.1:6389 started; fixture/test only.'

} finally { $startLock.Dispose() }
