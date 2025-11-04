# Test Worker with HMAC signature
$secret = '8afcc53512826bc6677fde490b1ca99e'
$shop = 'dev-store.myshopify.com'
$ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

# Build message
$message = "shop=$shop" + "timestamp=$ts"

# Compute HMAC-SHA256
$hmacsha = New-Object System.Security.Cryptography.HMACSHA256
$hmacsha.Key = [System.Text.Encoding]::UTF8.GetBytes($secret)
$hash = $hmacsha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($message))
$hex = ($hash | ForEach-Object { $_.ToString("x2") }) -join ''

Write-Output "Testing non-streaming mode..."
Write-Output "Signature: $hex"
Write-Output "Timestamp: $ts"
Write-Output ""

# Test non-streaming
& curl.exe -i -X POST "https://epir-art-jewellery-worker.krzysztofdzugaj.workers.dev/chat?shop=$shop&timestamp=$ts&signature=$hex" -H "Content-Type: application/json" -d '{"message":"Czym się zajmujecie?","stream":false}'

Write-Output "`n`n=== Testing streaming mode ===`n"

# New timestamp and signature for streaming test
$ts2 = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$message2 = "shop=$shop" + "timestamp=$ts2"
$hash2 = $hmacsha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($message2))
$hex2 = ($hash2 | ForEach-Object { $_.ToString("x2") }) -join ''

& curl.exe -N -X POST "https://epir-art-jewellery-worker.krzysztofdzugaj.workers.dev/chat?shop=$shop&timestamp=$ts2&signature=$hex2" -H "Content-Type: application/json" -d '{"message":"Opowiedz krótko o jubilerstwie","stream":true}'
