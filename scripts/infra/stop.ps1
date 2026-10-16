$ErrorActionPreference = 'Stop'
$workspace = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$pgBin = Join-Path $workspace '.local\postgres\pgsql\bin'
$pgData = Join-Path $workspace '.local\data\postgres'
if (Test-Path -LiteralPath (Join-Path $pgData 'PG_VERSION')) { & (Join-Path $pgBin 'pg_ctl.exe') '-D' $pgData '-m' 'fast' '-w' 'stop' }
$redisCli = Get-ChildItem -LiteralPath (Join-Path $workspace '.local\memurai-stable') -Filter 'memurai-cli.exe' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
if ($redisCli) { & $redisCli '-h' '127.0.0.1' '-p' '6389' 'shutdown' 'save' }
