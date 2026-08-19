$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$VsCodeDir = Join-Path $RootDir "vscode-extension"
$BrowserDir = Join-Path $RootDir "browser-extension"

function Fail([string]$Message) {
    Write-Host ""
    Write-Host "[ERROR] $Message" -ForegroundColor Red
    exit 1
}

function Require-Command([string]$Name, [string]$InstallHint) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        Fail "Required command '$Name' was not found. $InstallHint"
    }
}

function Assert-LastExitCode([string]$Action) {
    if ($LASTEXITCODE -ne 0) {
        Fail "$Action failed with exit code $LASTEXITCODE."
    }
}

Write-Host "========================================"
Write-Host " GPT Coding installer"
Write-Host "========================================"
Write-Host ""
Write-Host "Checking prerequisites..."

Require-Command "git" "Install Git and make sure it is available in PATH."
Require-Command "node" "Install Node.js 20 or newer."
Require-Command "npm" "Install npm (normally included with Node.js)."
Require-Command "code" "Install VS Code and enable the 'code' command in PATH."

$NodeMajorRaw = & node -p "Number(process.versions.node.split('.')[0])"
Assert-LastExitCode "Reading the Node.js version"
$NodeMajor = [int]$NodeMajorRaw
if ($NodeMajor -lt 20) {
    $DetectedNode = & node --version
    Fail "Node.js 20 or newer is required. Detected: $DetectedNode"
}

$PackageJsonPath = Join-Path $VsCodeDir "package.json"
$ManifestPath = Join-Path $BrowserDir "manifest.json"

if (-not (Test-Path -LiteralPath $PackageJsonPath -PathType Leaf)) {
    Fail "Missing $PackageJsonPath"
}
if (-not (Test-Path -LiteralPath $ManifestPath -PathType Leaf)) {
    Fail "Missing $ManifestPath"
}

$GitVersion = & git --version
Assert-LastExitCode "Reading the Git version"
$NodeVersion = & node --version
Assert-LastExitCode "Reading the Node.js version"
$NpmVersion = & npm --version
Assert-LastExitCode "Reading the npm version"
$CodeVersionOutput = & code --version
Assert-LastExitCode "Reading the VS Code version"
$CodeVersion = @($CodeVersionOutput)[0]

Write-Host "[OK] Git: $GitVersion"
Write-Host "[OK] Node.js: $NodeVersion"
Write-Host "[OK] npm: $NpmVersion"
Write-Host "[OK] VS Code CLI: $CodeVersion"

Push-Location $VsCodeDir
try {
    Write-Host ""
    Write-Host "Installing VS Code extension dependencies..."
    & npm install
    Assert-LastExitCode "npm install"

    Write-Host ""
    Write-Host "Building and packaging VS Code extension..."
    Get-ChildItem -Path $VsCodeDir -Filter "gpt-coding-*.vsix" -File -ErrorAction SilentlyContinue |
        Remove-Item -Force

    & npm run package:vsix
    Assert-LastExitCode "VS Code extension packaging"

    $Package = Get-Content -LiteralPath $PackageJsonPath -Raw | ConvertFrom-Json
    $VsixPath = Join-Path $VsCodeDir ("{0}-{1}.vsix" -f $Package.name, $Package.version)

    if (-not (Test-Path -LiteralPath $VsixPath -PathType Leaf)) {
        Fail "Expected VSIX was not generated: $VsixPath"
    }

    Write-Host ""
    Write-Host "Installing VS Code extension..."
    & code --install-extension $VsixPath --force
    Assert-LastExitCode "VS Code extension installation"
}
finally {
    Pop-Location
}

Write-Host ""
Write-Host "[OK] VS Code extension installed: $VsixPath" -ForegroundColor Green
Write-Host "[OK] Browser extension ready: $BrowserDir" -ForegroundColor Green

Write-Host ""
Write-Host "========================================"
Write-Host " MANUAL CHROME SETUP"
Write-Host "========================================"
Write-Host "The VS Code extension is installed. Chrome requires one manual step to load the local browser extension."
Write-Host ""
Write-Host "1. Open Chrome."
Write-Host "2. Go to: chrome://extensions"
Write-Host '3. Enable "Developer mode" in the top-right corner.'
Write-Host '4. Click "Load unpacked".'
Write-Host "5. Select this exact folder:"
Write-Host ""
Write-Host "   $BrowserDir" -ForegroundColor Cyan
Write-Host ""
Write-Host '6. Confirm that "GPT Coding Bridge" appears enabled.'
Write-Host "7. Keep the extension enabled while using GPT Coding."
Write-Host ""
Write-Host "IMPORTANT: GPT Coding only inserts the prepared prompt. Review it and press Send in ChatGPT manually." -ForegroundColor Yellow
Write-Host ""
Write-Host "Installation finished." -ForegroundColor Green
