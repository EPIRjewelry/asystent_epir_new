# Skrypt PowerShell do testowania funkcji Firebase
# Użyj tego zamiast otwierania URL w przeglądarce

$functionUrl = "http://127.0.0.1:5001/asystent-epir-56ca1/us-central1/callAnalyticsAgent"

$payload = @{
    data = @{
        input = "Przeanalizuj sprzedaż biżuterii w ostatnim miesiącu"
    }
} | ConvertTo-Json -Depth 3

$headers = @{
    "Content-Type" = "application/json"
}

try {
    Write-Host "Wysyłanie żądania POST do funkcji..."
    $response = Invoke-RestMethod -Uri $functionUrl -Method POST -Body $payload -Headers $headers
    Write-Host "Odpowiedź:" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 3
} catch {
    Write-Host "Błąd: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        Write-Host "Status Code: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
    }
}
