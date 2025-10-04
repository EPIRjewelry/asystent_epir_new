<#
PowerShell script: test_appproxy_hmac.ps1
Generates HMAC-SHA256 (hex) for Shopify App Proxy and calls the /chat endpoint.
Usage: Open PowerShell in project root and run: .\scripts\test_appproxy_hmac.ps1
You will be prompted for SHOPIFY_APP_SECRET (paste it, it won't be stored).
#>

# --- Configuration (change if needed) ---
$shop = 'epir-art-silver-jewellery.myshopify.com'   # <= your shop domain
# Use App Proxy URL (recommended) or direct Worker URL by uncommenting the second line
$useAppProxy = $true
$workerUrl = 'https://epir-art-jewellery-worker.krzysztofdzugaj.workers.dev'
# ---------------------------------------

# Read secret from user (secure)
$secureSecret = Read-Host -AsSecureString 'Paste SHOPIFY_APP_SECRET (will not be stored)'
$plainSecret = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureSecret))

$timestamp = (Get-Date -UFormat %s)
$params = @{ shop = $shop; timestamp = $timestamp }

# Build message: sorted key=value pairs concatenated WITHOUT separators
$message = ($params.GetEnumerator() | Sort-Object Name | ForEach-Object { "$($_.Name)=$($_.Value)" }) -join ''

# Compute HMAC-SHA256 -> hex
$hmac = New-Object System.Security.Cryptography.HMACSHA256 ([System.Text.Encoding]::UTF8.GetBytes($plainSecret))
$hashBytes = $hmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($message))
$hex = ($hashBytes | ForEach-Object { $_.ToString('x2') }) -join ''

Write-Host "message: $message"
Write-Host "signature (hex): $hex"

if ($useAppProxy) {
    $url = "https://$shop/apps/assistant/chat?shop=$shop&timestamp=$timestamp&signature=$hex"
} else {
    $url = "$workerUrl/chat?shop=$shop&timestamp=$timestamp&signature=$hex"
}

Write-Host "Calling: $url"

try {
    $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -ErrorAction Stop
    Write-Host "Status: $($resp.StatusCode)"
    Write-Host "Body:`n$($resp.Content)"
} catch {
    if ($_.Exception.Response -ne $null) {
        $status = $_.Exception.Response.StatusCode.Value__
        $desc = $_.Exception.Response.StatusDescription
        Write-Host "HTTP Error: $status $desc"
        try { $_.Exception.Response | Format-List -Property * } catch {}
    } else {
        Write-Host "Error: $($_.Exception.Message)"
    }
}

# End of script
