<#
.SYNOPSIS
    Sparse-checkout the four Anthropic document skills into src/workspace/skills/.

.DESCRIPTION
    Clones github.com/anthropics/skills with a blobless, sparse checkout limited to
    skills/docx, skills/pdf, skills/pptx and skills/xlsx, then copies those four folders
    VERBATIM into <repo>/src/workspace/skills/. Existing copies are replaced.

.EXAMPLE
    py -3.13 -m pip install -e .   # (once)
    ./scripts/fetch_skills.ps1
#>
[CmdletBinding()]
param(
    [string]$Repo = "https://github.com/anthropics/skills"
)
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$dest = Join-Path $root "src/workspace/skills"
$skills = @("docx", "pdf", "pptx", "xlsx")

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("skills_" + [System.Guid]::NewGuid().ToString("N"))
Write-Host "Cloning $Repo (sparse) into $tmp ..."
git clone --depth 1 --filter=blob:none --sparse $Repo $tmp
Push-Location $tmp
try {
    git sparse-checkout set ($skills | ForEach-Object { "skills/$_" })
}
finally {
    Pop-Location
}

New-Item -ItemType Directory -Force -Path $dest | Out-Null
foreach ($s in $skills) {
    $src = Join-Path $tmp "skills/$s"
    $target = Join-Path $dest $s
    if (Test-Path $target) { Remove-Item -Recurse -Force $target }
    Copy-Item -Recurse -Force $src $target
    Write-Host "Copied $s -> $target"
}
Remove-Item -Recurse -Force $tmp
Write-Host "Done. Skills are in $dest"
