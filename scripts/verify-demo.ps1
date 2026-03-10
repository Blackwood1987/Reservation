[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$originalLocation = Get-Location

function Invoke-Step {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][scriptblock]$Action
    )

    Write-Host "==> $Name" -ForegroundColor Cyan
    & $Action
    if ($LASTEXITCODE -ne 0) {
        throw "Verification failed during: $Name"
    }
}

try {
    Set-Location $repoRoot

    Invoke-Step -Name 'JavaScript syntax check' -Action { node --check app.js }
    Invoke-Step -Name 'Core utility tests' -Action { node tests/run-tests.mjs }
    Invoke-Step -Name 'Text integrity check' -Action { node tests/check-text-integrity.mjs }
    Invoke-Step -Name 'Git diff format check' -Action { git diff --check }

    Write-Host 'Verification passed' -ForegroundColor Green
}
finally {
    Set-Location $originalLocation
}
