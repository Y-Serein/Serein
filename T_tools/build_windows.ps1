param(
  [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$appDir = Join-Path $repoRoot "D_deliverables\serein-desktop"
$tauriCli = Join-Path $appDir "node_modules\@tauri-apps\cli\tauri.js"
$tauriWinCliPackage = Join-Path $appDir "node_modules\@tauri-apps\cli-win32-x64-msvc"
$targetDir = Join-Path $appDir "src-tauri\target"

function Get-MakensisPath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$NsisScript
  )

  $candidates = @()

  if ($env:LOCALAPPDATA) {
    $candidates += Join-Path $env:LOCALAPPDATA "tauri\NSIS\makensis.exe"
  }

  $pluginLine = Select-String -Path $NsisScript -Pattern '^!define ADDITIONALPLUGINSPATH "(.+)"' -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($pluginLine) {
    $pluginPath = $pluginLine.Matches[0].Groups[1].Value
    $nsisRoot = Split-Path -Parent $pluginPath
    $nsisRoot = Split-Path -Parent $nsisRoot
    $nsisRoot = Split-Path -Parent $nsisRoot
    $candidates += Join-Path $nsisRoot "makensis.exe"
  }

  $command = Get-Command makensis.exe -ErrorAction SilentlyContinue
  if ($command) {
    $candidates += $command.Source
  }
  $command = Get-Command makensis -ErrorAction SilentlyContinue
  if ($command) {
    $candidates += $command.Source
  }

  $makensis = $candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
  if (-not $makensis) {
    throw "makensis.exe not found. Tauri built the NSIS script, but the installer UX patch cannot be recompiled."
  }

  return $makensis
}

function Replace-FirstRegexLiteral {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Content,
    [Parameter(Mandatory = $true)]
    [string]$Pattern,
    [Parameter(Mandatory = $true)]
    [string]$Replacement,
    [Parameter(Mandatory = $true)]
    [string]$ErrorMessage
  )

  $match = [regex]::Match($Content, $Pattern)
  if (-not $match.Success) {
    throw $ErrorMessage
  }

  return $Content.Substring(0, $match.Index) + $Replacement + $Content.Substring($match.Index + $match.Length)
}

function Invoke-SereinNsisInstallerPolish {
  param(
    [Parameter(Mandatory = $true)]
    [string]$AppDir
  )

  $nsisScript = Join-Path $AppDir "src-tauri\target\release\nsis\x64\installer.nsi"
  if (-not (Test-Path $nsisScript)) {
    throw "NSIS script not found: $nsisScript"
  }

  $content = (Get-Content $nsisScript -Raw -Encoding UTF8) -replace "`r`n", "`n"
  $content = $content -replace "`r", "`n"

  if ($content -notmatch "Var AutoReinstall") {
    $content = Replace-FirstRegexLiteral `
      -Content $content `
      -Pattern '(?m)^Var ReinstallPageCheck[ \t]*$' `
      -Replacement "Var ReinstallPageCheck`nVar AutoReinstall" `
      -ErrorMessage "Cannot patch NSIS reinstall page: reinstall state variable changed."
  }

  if ($content -notmatch "Serein prefers one-step") {
    $replacement = @'
  Pop $R0
  ; Serein prefers one-step installs: skip the extra maintenance choice page.
  ; Same-version installs continue as reinstall; upgrades/downgrades remove the old install first.
  ${If} $R0 = 0
  ${OrIf} $R0 = 1
  ${OrIf} $R0 = -1
    StrCpy $AutoReinstall 1
    Call PageLeaveReinstall
    Abort
  ${EndIf}
  ; Reinstalling the same version
'@

    $content = Replace-FirstRegexLiteral `
      -Content $content `
      -Pattern '(?m)^[ \t]*Pop \$R0[ \t]*\n[ \t]*; Reinstalling the same version[ \t]*$' `
      -Replacement $replacement `
      -ErrorMessage "Cannot patch NSIS reinstall page: version comparison block changed."
  }

  if ($content -notmatch '\$AutoReinstall = 1') {
    $replacement = @'
Function PageLeaveReinstall
  ${If} $AutoReinstall = 1
    StrCpy $R1 1
    StrCpy $AutoReinstall 0
  ${Else}
    ${NSD_GetState} $R2 $R1
  ${EndIf}
'@
    $content = Replace-FirstRegexLiteral `
      -Content $content `
      -Pattern '(?m)^Function PageLeaveReinstall[ \t]*\n[ \t]*\$\{NSD_GetState\}[ \t]+\$R2[ \t]+\$R1[ \t]*\n' `
      -Replacement $replacement `
      -ErrorMessage "Cannot patch NSIS reinstall page: leave handler changed."
  }

  $utf8NoBom = New-Object System.Text.UTF8Encoding -ArgumentList $false
  [System.IO.File]::WriteAllText($nsisScript, $content, $utf8NoBom)

  $makensis = Get-MakensisPath -NsisScript $nsisScript
  $nsisDir = Split-Path -Parent $nsisScript
  $rebuiltInstaller = Join-Path $nsisDir "nsis-output.exe"
  if (Test-Path $rebuiltInstaller) {
    Remove-Item $rebuiltInstaller -Force
  }

  Push-Location $nsisDir
  try {
    & $makensis (Split-Path -Leaf $nsisScript)
    if ($LASTEXITCODE -ne 0) {
      throw "makensis failed with exit code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }

  if (-not (Test-Path $rebuiltInstaller)) {
    throw "Rebuilt NSIS installer not found: $rebuiltInstaller"
  }

  $tauriConfig = Get-Content (Join-Path $AppDir "src-tauri\tauri.conf.json") -Raw -Encoding UTF8 | ConvertFrom-Json
  $archLine = Select-String -Path $nsisScript -Pattern '^!define ARCH "(.+)"' -ErrorAction SilentlyContinue | Select-Object -First 1
  $arch = if ($archLine) { $archLine.Matches[0].Groups[1].Value } else { "x64" }
  $bundleDir = Join-Path $AppDir "src-tauri\target\release\bundle\nsis"
  $setupName = "{0}_{1}_{2}-setup.exe" -f $tauriConfig.productName, $tauriConfig.version, $arch
  $setupPath = Join-Path $bundleDir $setupName
  if (-not (Test-Path $setupPath)) {
    throw "Expected NSIS setup artifact not found: $setupPath"
  }

  Copy-Item $rebuiltInstaller $setupPath -Force
  Write-Host "Rebuilt NSIS installer with one-step upgrade flow: $setupPath"
}

if (-not (Test-Path $appDir)) {
  throw "App directory not found: $appDir"
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js is required. Install Node.js LTS on Windows first."
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "npm is required. Install Node.js LTS on Windows first."
}

if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
  throw "Rust/Cargo is required. Install Rust stable with rustup on Windows first."
}

Push-Location $appDir
try {
  Write-Host "Node:  $(node -v)"
  Write-Host "npm:   $(npm -v)"
  Write-Host "cargo: $(cargo -V)"
  Write-Host ""

  $needsInstall = (-not (Test-Path "node_modules")) -or (-not (Test-Path $tauriWinCliPackage))

  if ($SkipInstall) {
    if (-not (Test-Path "node_modules")) {
      throw "node_modules not found. Run this script without -SkipInstall so npm ci can install dependencies."
    }
    if (-not (Test-Path $tauriWinCliPackage)) {
      throw "Windows Tauri CLI package not found: $tauriWinCliPackage. node_modules may have been installed from WSL/Linux. Run this script without -SkipInstall to reinstall Windows dependencies."
    }
  } else {
    if ($needsInstall) {
      npm ci
      if ($LASTEXITCODE -ne 0) {
        throw "npm ci failed with exit code $LASTEXITCODE"
      }
    } else {
      Write-Host "node_modules exists and Windows Tauri CLI package is present; skipping npm ci. Delete node_modules if dependencies look stale."
    }
  }

  if (-not (Test-Path $tauriCli)) {
    throw "Tauri CLI not found: $tauriCli. Run this script without -SkipInstall, or run npm ci in $appDir."
  }

  node $tauriCli build --bundles nsis
  if ($LASTEXITCODE -ne 0) {
    throw "tauri build failed with exit code $LASTEXITCODE"
  }

  Invoke-SereinNsisInstallerPolish -AppDir $appDir

  Write-Host ""
  Write-Host "Build artifacts:"
  $artifacts = @()
  if (Test-Path $targetDir) {
    $artifacts = @(Get-ChildItem $targetDir -Recurse -File -Include *.exe,*.msi)
  }

  if ($artifacts.Count -eq 0) {
    throw "No .exe or .msi artifacts found under: $targetDir"
  }

  $artifacts | ForEach-Object {
    Write-Host $_.FullName
  }
} finally {
  Pop-Location
}
