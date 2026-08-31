# ============================================================
# Supabase keepalive (PowerShell + curl.exe)
# Rhythm: 2 requests every 3 days -> ping every 36 hours
# Activity: REST query + Auth ping via curl.exe
# Per official docs, a few DB requests per week prevent the
# free-tier 7-day inactivity pause. 36h cadence is ample.
# ============================================================
$ErrorActionPreference = "SilentlyContinue"

$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$stampFile = Join-Path $dir ".keepalive-stamp"
$logFile = Join-Path $dir "keepalive.log"
$intervalHours = 36

$now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$last = 0
if (Test-Path $stampFile) {
    $last = [int64](Get-Content $stampFile -Raw)
}

if (($now - $last) -lt ($intervalHours * 3600)) {
    exit 0   # not due yet (hourly calls mostly exit here)
}

# ---- read config.js (url + anon key) ----
$config = Get-Content (Join-Path $dir "config.js") -Raw
$url = ""
$anon = ""
$urlM = [regex]::Match($config, "url:\s*\x27([^\x27]+)\x27")
if ($urlM.Success) { $url = $urlM.Groups[1].Value }
$anonM = [regex]::Match($config, "anonKey:\s*\x27([^\x27]+)\x27")
if ($anonM.Success) { $anon = $anonM.Groups[1].Value }

if (-not $anon) {
    Add-Content $logFile ("[{0}] ERROR: no anon key" -f (Get-Date))
    exit 1
}

# ---- curl keepalive requests (real DB read + auth ping) ----
$restUrl = "$url/rest/v1/forum_topics?select=id&limit=1"
$code1 = & curl.exe -s -o NUL -w "%{http_code}" -H "apikey: $anon" -H "Authorization: Bearer $anon" $restUrl
$code2 = & curl.exe -s -o NUL -w "%{http_code}" "$url/auth/v1/health"

Add-Content $logFile ("[{0}] ping rest:{1} auth:{2}" -f (Get-Date), $code1, $code2)
Set-Content $stampFile $now
exit 0
