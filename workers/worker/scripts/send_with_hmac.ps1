param(
  [Parameter(Mandatory=$true)] [string]$Secret,
  [string]$Url = "https://asystent.epirbizuteria.pl/apps/assistant/chat",
  [string]$Body = '{"message":"test"}',
  [switch]$IncludeTimestamp,
  [switch]$UseHeaderBase64
)

# Compute epoch seconds
function Get-EpochSeconds {
  $epoch = [int]((Get-Date).ToUniversalTime() - (Get-Date "1970-01-01T00:00:00Z")).TotalSeconds
  return $epoch
}

$encoding = [System.Text.Encoding]::UTF8
$bodyBytes = $encoding.GetBytes($Body)

$canonical = ''
if ($IncludeTimestamp) {
  $ts = Get-EpochSeconds
  $canonical = "timestamp=$ts"
}

# Combine canonical params (as bytes) and body
if ([string]::IsNullOrEmpty($canonical)) {
  $combined = $bodyBytes
} else {
  $canBytes = $encoding.GetBytes($canonical)
  $combined = New-Object 'System.Byte[]' ($canBytes.Length + $bodyBytes.Length)
  [System.Buffer]::BlockCopy($canBytes, 0, $combined, 0, $canBytes.Length)
  [System.Buffer]::BlockCopy($bodyBytes, 0, $combined, $canBytes.Length, $bodyBytes.Length)
}

$hmac = [System.Security.Cryptography.HMACSHA256]::new($encoding.GetBytes($Secret))
$hashBytes = $hmac.ComputeHash($combined)
$hexSignature = [System.BitConverter]::ToString($hashBytes).Replace('-', '').ToLower()
$base64Signature = [System.Convert]::ToBase64String($hashBytes)

# Build URL
if ($UseHeaderBase64) {
  # Use header instead of query param
  $fullUrl = if ($IncludeTimestamp) { "${Url}?timestamp=$ts" } else { $Url }
  $header = @{ 'Content-Type' = 'application/json'; 'x-shopify-hmac-sha256' = $base64Signature }
} else {
  $signature = $hexSignature
    if ($IncludeTimestamp) {
    $fullUrl = "${Url}?timestamp=$ts&signature=$signature"
  } else {
    $fullUrl = "${Url}?signature=$signature"
  }
  $header = @{ 'Content-Type' = 'application/json' }
}

Write-Host "Base URL: $Url" -ForegroundColor Cyan
Write-Host "Calling $fullUrl" -ForegroundColor Cyan
if ($UseHeaderBase64) { Write-Host "Header signature (base64): $base64Signature" -ForegroundColor Yellow } else { Write-Host "Signature: $signature" -ForegroundColor Yellow }

try {
  # Use HttpClient to send exact bytes (avoid PowerShell encoding differences)
  Add-Type -AssemblyName System.Net.Http
  $client = New-Object System.Net.Http.HttpClient
  $request = New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::Post, $fullUrl)
  $byteArray = [byte[]] $bodyBytes
  $content = [System.Net.Http.ByteArrayContent]::new($byteArray)
  $content.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse('application/json')
  $request.Content = $content
  foreach ($key in $header.Keys) {
    if ($key -ne 'Content-Type') {
      $request.Headers.Remove($key) | Out-Null
      $request.Headers.Add($key, $header[$key])
    }
  }
  $resp = $client.SendAsync($request).Result
  Write-Host "Status: $($resp.StatusCode)" -ForegroundColor Green
  $bodyResp = $resp.Content.ReadAsStringAsync().Result
  Write-Host $bodyResp
} catch {
  Write-Host "Request failed: $($_.Exception.Message)" -ForegroundColor Red
}
