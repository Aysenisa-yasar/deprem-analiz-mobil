$ErrorActionPreference = 'Stop'

$source = Split-Path -Parent $MyInvocation.MyCommand.Path
$buildRoot = 'D:\DepremAnalizAndroid'
$mirror = Join-Path $buildRoot 'mobile'
$excludeDirs = @(
  (Join-Path $source '.expo'),
  (Join-Path $source 'android\.gradle'),
  (Join-Path $source 'android\build'),
  (Join-Path $source 'android\app\build'),
  (Join-Path $source 'android\app\.cxx'),
  (Join-Path $source 'node_modules\.cache')
)
$excludeFiles = @(
  'expo-start*.log',
  'expo-start*.err',
  'expo-*.log',
  'expo-*.err',
  'backend-*.log',
  'backend-*.err'
)

if (-not (Test-Path $buildRoot)) {
  New-Item -ItemType Directory -Path $buildRoot | Out-Null
}

$moduleAndroidCacheDirs = @()
if (Test-Path (Join-Path $source 'node_modules')) {
  $moduleAndroidCacheDirs = Get-ChildItem (Join-Path $source 'node_modules') -Directory -Recurse -ErrorAction SilentlyContinue |
    Where-Object {
      $_.FullName -like '*\android\build' -or $_.FullName -like '*\android\.cxx'
    } |
    Select-Object -ExpandProperty FullName
}

$robocopyArgs = @(
  $source,
  $mirror,
  '/MIR',
  '/R:2',
  '/W:1',
  '/NFL',
  '/NDL',
  '/NJH',
  '/NJS',
  '/NP'
)

foreach ($dir in ($excludeDirs + $moduleAndroidCacheDirs)) {
  if (Test-Path $dir) {
    $robocopyArgs += '/XD'
    $robocopyArgs += $dir
  }
}

foreach ($file in $excludeFiles) {
  $robocopyArgs += '/XF'
  $robocopyArgs += $file
}

& robocopy @robocopyArgs

if ($LASTEXITCODE -ge 8) {
  exit $LASTEXITCODE
}

$mirrorAndroid = Join-Path $mirror 'android'
$staleGradleDirs = @(
  (Join-Path $mirrorAndroid '.gradle'),
  (Join-Path $mirrorAndroid 'build'),
  (Join-Path $mirrorAndroid 'app\build')
)

foreach ($dir in $staleGradleDirs) {
  if (Test-Path $dir) {
    Remove-Item -LiteralPath $dir -Recurse -Force
  }
}

$androidModuleCacheDirs = Get-ChildItem (Join-Path $mirror 'node_modules') -Directory -Recurse -ErrorAction SilentlyContinue |
  Where-Object {
    $_.FullName -like '*\android\build' -or $_.FullName -like '*\android\.cxx'
  }

foreach ($dir in $androidModuleCacheDirs) {
  if ($dir.FullName.StartsWith($mirror, [System.StringComparison]::OrdinalIgnoreCase)) {
    Remove-Item -LiteralPath $dir.FullName -Recurse -Force
  }
}

exit 0
