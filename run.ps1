<#
  RBI E2E test runner for Windows PowerShell.

  Usage (from the project folder):
    .\run.ps1              # interactive menu
    .\run.ps1 setup        # install everything (first time)
    .\run.ps1 full         # crawl whole site + run every test
    .\run.ps1 functional   # feature tests (desktop + mobile)
    .\run.ps1 locators     # check every XPath still matches the site
    .\run.ps1 crawl        # only discover pages
    .\run.ps1 pages        # per-page health checks (after crawl)
    .\run.ps1 links        # broken-link check (after crawl)
    .\run.ps1 a11y         # accessibility scan (after crawl)
    .\run.ps1 clickall     # click every button/tab/dropdown on every page (after crawl)
    .\run.ps1 headed       # functional tests in a visible browser
    .\run.ps1 footer       # footer tests (soft assertions)
    .\run.ps1 report       # open the last HTML report
    .\run.ps1 extent       # open the last Extent report

  If Windows blocks the script, run once:
    Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
#>
param([string]$Task = "")

$ErrorActionPreference = "Continue"
Set-Location -Path $PSScriptRoot

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }

function Ensure-Setup {
    if (-not (Test-Path "node_modules")) { Invoke-Setup }
    if (-not (Test-Path ".env")) { Copy-Item ".env.example" ".env"; Write-Host "Created .env from .env.example" }
}

function Invoke-Setup {
    Step "Checking Node.js"
    try { $v = node -v; Write-Host "Node $v" } catch { throw "Node.js is not installed. Get the LTS version from https://nodejs.org and re-run." }
    Step "Installing packages"
    npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
    Step "Installing Chromium for Playwright"
    npx playwright install chromium
    if ($LASTEXITCODE -ne 0) { throw "playwright install failed" }
    if (-not (Test-Path ".env")) { Copy-Item ".env.example" ".env"; Write-Host "Created .env from .env.example" }
    Write-Host "`nSetup complete." -ForegroundColor Green
}

function Run($label, [string[]]$cmd) {
    Step $label
    & $cmd[0] $cmd[1..($cmd.Length - 1)]
    $script:lastExit = $LASTEXITCODE
}

function Show-Report {
    if (Test-Path "playwright-report\index.html") { npx playwright show-report }
    else { Write-Host "No report yet - run some tests first." -ForegroundColor Yellow }
}

function Show-Extent {
    if (Test-Path "extent-report\index.html") { Invoke-Item "extent-report\index.html" }
    else { Write-Host "No Extent report yet - run some tests first." -ForegroundColor Yellow }
}

function Invoke-Task($t) {
    switch ($t) {
        "setup"      { Invoke-Setup; return }
        "crawl"      { Ensure-Setup; Run "Crawling site" @("npm", "run", "crawl") }
        "full"       {
            Ensure-Setup
            Run "Crawling site" @("npm", "run", "crawl")
            Run "Running all tests" @("npx", "playwright", "test")
        }
        "functional" { Ensure-Setup; Run "Functional tests (desktop + mobile)" @("npx", "playwright", "test", "tests/functional") }
        "locators"   { Ensure-Setup; Run "XPath locator health check" @("npx", "playwright", "test", "xpath-locators", "--project=desktop-chrome") }
        "pages"      { Ensure-Setup; Run "Per-page checks" @("npx", "playwright", "test", "tests/crawl/pages.spec.ts") }
        "links"      { Ensure-Setup; Run "Broken-link check" @("npx", "playwright", "test", "tests/crawl/links.spec.ts") }
        "a11y"       { Ensure-Setup; Run "Accessibility scan" @("npx", "playwright", "test", "tests/crawl/a11y.spec.ts") }
        "clickall"   { Ensure-Setup; Run "Auto-click every button on every page" @("npx", "playwright", "test", "tests/crawl/interactions.spec.ts", "--project=desktop-chrome") }
        "headed"     { Ensure-Setup; Run "Functional tests in a visible browser" @("npx", "playwright", "test", "tests/functional", "--project=desktop-chrome", "--headed", "--workers=1") }
        "footer"     { Ensure-Setup; Run "Footer tests" @("npx", "playwright", "test", "footer.spec.ts") }
        "report"     { Show-Report; return }
        "extent"     { Show-Extent; return }
        default      { Write-Host "Unknown task '$t'" -ForegroundColor Red; return }
    }
    if ($script:lastExit -eq 0) { Write-Host "`nAll tests passed." -ForegroundColor Green }
    else { Write-Host "`nSome tests failed - opening the report." -ForegroundColor Yellow }
    Show-Report
}

if ($Task) { Invoke-Task $Task.ToLower(); exit $script:lastExit }

$menu = [ordered]@{
    "1" = @("setup",      "First-time setup (install packages + browser)")
    "2" = @("full",       "FULL TEST: crawl whole site + run every test")
    "3" = @("functional", "Functional tests only (menus, search, filters, a11y toolbar...)")
    "4" = @("locators",   "Check XPath locators still match the site")
    "5" = @("crawl",      "Crawl only (discover all pages)")
    "6" = @("pages",      "Per-page health checks (needs crawl)")
    "7" = @("links",      "Broken-link check (needs crawl)")
    "8" = @("a11y",       "Accessibility scan (needs crawl)")
    "9" = @("headed",     "Watch functional tests run in a browser")
    "C" = @("clickall",   "Auto-click every button/tab/dropdown on every page (needs crawl)")
    "F" = @("footer",     "Footer tests (links, social, copyright, mobile)")
    "E" = @("extent",     "Open last Extent report")
    "0" = @("report",     "Open last report")
}
Write-Host "`nRBI website - E2E tests" -ForegroundColor Cyan
foreach ($k in $menu.Keys) { Write-Host ("  {0}) {1}" -f $k, $menu[$k][1]) }
$choice = Read-Host "`nChoose"
$choice = $choice.ToUpper()
if ($menu.Contains($choice)) { Invoke-Task $menu[$choice][0] } else { Write-Host "No such option." }
