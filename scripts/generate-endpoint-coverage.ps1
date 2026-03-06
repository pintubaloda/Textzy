param(
  [string]$RepoRoot,
  [string]$OutFile
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
  $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}
if ([string]::IsNullOrWhiteSpace($OutFile)) {
  $OutFile = Join-Path $RepoRoot "ENDPOINT_COVERAGE_REPORT.md"
}

$frontendRoot = Join-Path $RepoRoot "frontend\src"
$backendRoot = Join-Path $RepoRoot "backend-dotnet\Controllers"

if (-not (Test-Path $frontendRoot)) { throw "Missing frontend source: $frontendRoot" }
if (-not (Test-Path $backendRoot)) { throw "Missing backend controllers: $backendRoot" }

function Normalize-Front([string]$path) {
  if ($null -eq $path) { return $null }
  $p = $path.Trim()
  if ([string]::IsNullOrWhiteSpace($p)) { return $null }
  if (-not $p.StartsWith("/api/")) { return $null }
  if ($p.Contains("`n") -or $p.Contains("`r") -or $p.Contains("&#10;") -or $p.Contains('\n')) { return $null }
  # Convert template placeholders to normalized params for matching
  $p = [regex]::Replace($p, '\$\{[^}]+\}', '{param}')
  # If interpolation exists, keep the static prefix before first interpolation.
  if ($p.Contains('${')) {
    $idx = $p.IndexOf('${')
    if ($idx -gt 0) {
      $p = $p.Substring(0, $idx)
      if ($p.EndsWith('/')) { $p = $p + '{param}' }
    } else {
      return $null
    }
  }
  if ($p.Contains('${qs.toString()')) { return $null }
  if ($p.Contains('/api/template-lifecycle/{param}/{param}')) { return $null }
  if ($p.StartsWith("/hubs/")) { return $null }
  $p = ($p -split "\?")[0].TrimEnd("/")
  # Fix malformed extraction like "/api/sms/templates{param}" -> "/api/sms/templates/{param}"
  if ($p -match '^/api/[a-z0-9\-/]+[^/]\{param\}$') {
    $p = $p -replace '\{param\}$', '/{param}'
  }
  if ($p -eq "/api/auth" -or $p -eq "/api/public" -or $p -eq "/api/platform" -or $p -eq "/api/payment/webhooks" -or $p -eq "/api/payments/webhook") { return $null }
  return $p
}

function Normalize-Back([string]$path) {
  if ($null -eq $path) { return $null }
  $p = $path.Trim()
  if ([string]::IsNullOrWhiteSpace($p)) { return $null }
  if (-not $p.StartsWith("/")) { $p = "/$p" }
  $p = ($p -split "\?")[0].TrimEnd("/")
  return $p
}

function Route-Regex([string]$route) {
  $e = [regex]::Escape($route)
  # [regex]::Escape escapes "{" as "\{" but "}" is not escaped.
  $e = $e -replace '\\\{[^}]+\}', '[^/]+'
  return "^$e$"
}

# ---- Frontend endpoints
$front = New-Object System.Collections.Generic.List[string]
$frontFiles = Get-ChildItem -Path $frontendRoot -Recurse -Include *.js,*.jsx,*.ts,*.tsx
foreach ($f in $frontFiles) {
  $content = Get-Content -Raw -Path $f.FullName
  $m1 = [regex]::Matches($content, "'(/api[^']*)'")
  foreach ($m in $m1) {
    $ep = Normalize-Front $m.Groups[1].Value
    if ($ep) { $front.Add($ep) }
  }
  $m2 = [regex]::Matches($content, '"/api[^"]*"')
  foreach ($m in $m2) {
    $raw = $m.Value.Trim('"')
    $ep = Normalize-Front $raw
    if ($ep) { $front.Add($ep) }
  }
  # template literals like `/api/items/${id}`
  $m3 = [regex]::Matches($content, '`(/api[^`]+)`')
  foreach ($m in $m3) {
    $ep = Normalize-Front $m.Groups[1].Value
    if ($ep) { $front.Add($ep) }
  }
  # strings like `${API_BASE}/api/...`
  $m4 = [regex]::Matches($content, '\$\{API_BASE\}(/api[^`"''\s\)]+)')
  foreach ($m in $m4) {
    $ep = Normalize-Front $m.Groups[1].Value
    if ($ep) { $front.Add($ep) }
  }
}
$frontUnique = $front | Sort-Object -Unique

# ---- Backend routes
$back = New-Object System.Collections.Generic.List[string]
$ctrlFiles = Get-ChildItem -Path $backendRoot -Recurse -Include *.cs
foreach ($f in $ctrlFiles) {
  $lines = Get-Content -Path $f.FullName
  $baseRoutes = @()
  foreach ($line in $lines) {
    if ($line -match '\[Route\("([^"]+)"\)\]') {
      $baseRoutes += $matches[1]
      continue
    }
    if ($line -match '\[Http(Get|Post|Put|Patch|Delete)\("([^"]*)"\)\]') {
      $sub = $matches[2]
      if ($baseRoutes.Count -eq 0) {
        # Support controllers using absolute route directly on Http* attribute.
        $nr = Normalize-Back $sub
        if ($nr) { $back.Add($nr) }
        continue
      }
      foreach ($baseRoute in $baseRoutes) {
        $full = if ([string]::IsNullOrWhiteSpace($sub)) { $baseRoute } else { "$baseRoute/$sub" }
        $nr = Normalize-Back $full
        if ($nr) { $back.Add($nr) }
      }
      continue
    }
    if ($line -match '\[Http(Get|Post|Put|Patch|Delete)\]') {
      if ($baseRoutes.Count -eq 0) { continue }
      foreach ($baseRoute in $baseRoutes) {
        $nr = Normalize-Back $baseRoute
        if ($nr) { $back.Add($nr) }
      }
      continue
    }
  }
}
$backUnique = $back | Sort-Object -Unique
$backRegexRows = $backUnique | ForEach-Object {
  [pscustomobject]@{ route = $_; regex = (Route-Regex $_) }
}

# ---- Compare
$frontMissing = New-Object System.Collections.Generic.List[string]
foreach ($f in $frontUnique) {
  $found = $false
  foreach ($b in $backRegexRows) {
    if ($f -match $b.regex) { $found = $true; break }
  }
  if (-not $found) { $frontMissing.Add($f) }
}

$backUnused = New-Object System.Collections.Generic.List[string]
foreach ($b in $backUnique) {
  $rx = Route-Regex $b
  $used = $false
  foreach ($f in $frontUnique) {
    if ($f -match $rx) { $used = $true; break }
  }
  if (-not $used) { $backUnused.Add($b) }
}

$generatedAt = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss zzz")

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add("# Endpoint Coverage Report")
$lines.Add("")
$lines.Add("Generated: $generatedAt")
$lines.Add("")
$lines.Add("## Summary")
$lines.Add("- Frontend endpoints discovered: $($frontUnique.Count)")
$lines.Add("- Backend routes discovered: $($backUnique.Count)")
$lines.Add("- Frontend endpoints missing in backend: $($frontMissing.Count)")
$lines.Add("- Backend routes not referenced by frontend: $($backUnused.Count)")
$lines.Add("")
$lines.Add("## Frontend Endpoints Missing in Backend")
if ($frontMissing.Count -eq 0) {
  $lines.Add("- None")
} else {
  foreach ($x in ($frontMissing | Sort-Object -Unique)) { $lines.Add("- $x") }
}
$lines.Add("")
$lines.Add("## Backend Routes Not Referenced by Frontend")
$lines.Add("Note: Many backend routes are intentionally internal/admin/webhook/diagnostic endpoints.")
if ($backUnused.Count -eq 0) {
  $lines.Add("- None")
} else {
  foreach ($x in ($backUnused | Sort-Object -Unique)) { $lines.Add("- $x") }
}

Set-Content -Path $OutFile -Value $lines -Encoding UTF8
Write-Output "Wrote report: $OutFile"
