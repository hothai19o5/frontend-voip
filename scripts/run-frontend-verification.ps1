param([switch]$UsePostman, [switch]$CallWindowOnly, [switch]$HistoryOnly, [switch]$ExpressionsOnly)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$previousLocation = Get-Location
$processes = @()
$envKeys = @('API_PROXY_TARGET', 'VITE_API_BASE_URL', 'TEST_FRONTEND_URL', 'TEST_CONTROL_URL', 'TEST_API_RUNNER', 'PORT')
$savedEnvironment = @{}
foreach ($key in $envKeys) { $savedEnvironment[$key] = [Environment]::GetEnvironmentVariable($key, 'Process') }

function Wait-Endpoint([string]$url, $process) {
  for ($attempt = 0; $attempt -lt 80; $attempt++) {
    if ($process.HasExited) { throw "Verification service exited. Inspect output/playwright/*.err.log." }
    try { $null = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 1; return } catch { $lastFailure = $_.Exception.Message; Start-Sleep -Milliseconds 250 }
  }
  throw "Verification service did not become ready: $url ($lastFailure)"
}

try {
  Set-Location -LiteralPath $projectRoot
  New-Item -ItemType Directory -Force -Path output\playwright | Out-Null
  $env:PORT = '14020'
  $env:API_PROXY_TARGET = 'http://127.0.0.1:14020/voip'
  $env:VITE_API_BASE_URL = ''
  $env:TEST_FRONTEND_URL = 'http://127.0.0.1:15173'
  $env:TEST_CONTROL_URL = 'http://127.0.0.1:14020/voip/__control'
  $nodeExecutable = (Get-Command node -ErrorAction Stop).Source
  if ($UsePostman) {
    $env:TEST_API_RUNNER = 'Postman local simulation'
    $postmanExecutable = (Get-Command postman -ErrorAction Stop).Source
    $apiProcess = Start-Process -FilePath $postmanExecutable -WindowStyle Hidden -PassThru `
      -ArgumentList @('simulation', 'run', 'postman/simulations/frontend-dev.sim.yaml', '--port', '14020', '--no-history', '--output', 'ndjson') `
      -RedirectStandardOutput output\playwright\api.log -RedirectStandardError output\playwright\api.err.log
  } else {
    $env:TEST_API_RUNNER = 'portable local handler; Postman dataset-daemon failed on Windows'
    $apiProcess = Start-Process -FilePath $nodeExecutable -WindowStyle Hidden -PassThru `
      -ArgumentList @('scripts/run-api-mock.cjs') `
      -RedirectStandardOutput output\playwright\api.log -RedirectStandardError output\playwright\api.err.log
  }
  $processes += $apiProcess
  Wait-Endpoint $env:TEST_CONTROL_URL $apiProcess
  $viteProcess = Start-Process -FilePath $nodeExecutable -WindowStyle Hidden -PassThru `
    -ArgumentList @('node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '15173', '--strictPort') `
    -RedirectStandardOutput output\playwright\vite.log -RedirectStandardError output\playwright\vite.err.log
  $processes += $viteProcess
  Wait-Endpoint "$($env:TEST_FRONTEND_URL)/login" $viteProcess
  if (!$CallWindowOnly -and !$HistoryOnly -and !$ExpressionsOnly) {
    node scripts/verify-frontend.mjs
    if ($LASTEXITCODE -ne 0) { throw "Frontend verification failed ($LASTEXITCODE)." }
  }
  if (!$CallWindowOnly -and !$ExpressionsOnly) {
    node scripts/verify-history.mjs
    if ($LASTEXITCODE -ne 0) { throw "History verification failed ($LASTEXITCODE)." }
  }
  if (!$CallWindowOnly -and !$HistoryOnly) {
    node scripts/verify-expressions.mjs
    if ($LASTEXITCODE -ne 0) { throw "Expressions verification failed ($LASTEXITCODE)." }
  }
  if (!$HistoryOnly -and !$ExpressionsOnly) {
    node scripts/verify-call-window.mjs
    if ($LASTEXITCODE -ne 0) { throw "Call window verification failed ($LASTEXITCODE)." }
  }
} finally {
  foreach ($process in $processes) { if (!$process.HasExited) { Stop-Process -Id $process.Id -ErrorAction SilentlyContinue } }
  foreach ($key in $envKeys) { [Environment]::SetEnvironmentVariable($key, $savedEnvironment[$key], 'Process') }
  Set-Location -LiteralPath $previousLocation
}
