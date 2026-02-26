$ErrorActionPreference = "Stop"

$backendDir = Resolve-Path "$PSScriptRoot\.."
Set-Location $backendDir

if (-not (Test-Path ".venv")) {
  python -m venv .venv
}

& .\.venv\Scripts\python -m pip install --upgrade pip
$requirementsPath = Join-Path $backendDir "..\requirements.txt"
if (Test-Path $requirementsPath) {
  & .\.venv\Scripts\python -m pip install -r $requirementsPath
}
& .\.venv\Scripts\python -m pip install pyinstaller

$specPath = Join-Path $backendDir "django_api.spec"
if (Test-Path $specPath) {
  & .\.venv\Scripts\python -m PyInstaller `
    --clean `
    --noconfirm `
    $specPath
} else {
  $addData = @(
    "config;config",
    "tenants;tenants",
    "security;security",
    "catalog;catalog",
    "inventory;inventory",
    "customers;customers",
    "taxes;taxes",
    "transactions;transactions",
    "accounting;accounting",
    "reporting;reporting"
  )

  $addDataArgs = @()
  foreach ($entry in $addData) {
    $addDataArgs += "--add-data"
    $addDataArgs += $entry
  }

  & .\.venv\Scripts\python -m PyInstaller `
    --onefile `
    --clean `
    --noconfirm `
    --name django_api `
    @addDataArgs `
    packaging\launcher.py
}

if (Test-Path ".env.pos") {
  Copy-Item ".env.pos" ".\dist\.env" -Force
}
