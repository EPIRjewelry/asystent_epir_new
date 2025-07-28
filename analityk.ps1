# Skrypt do testowania różnych zapytań do analityka EPIR

param(
    [string]$Zapytanie = "Jak zwiększyć sprzedaż pierścionków zaręczynowych?"
)

$functionUrl = "http://127.0.0.1:5001/asystent-epir-56ca1/us-central1/callAnalyticsAgent"

$payload = @{
    data = @{
        input = $Zapytanie
    }
} | ConvertTo-Json -Depth 3

$headers = @{
    "Content-Type" = "application/json"
}

try {
    Write-Host "🤖 Pytanie do analityka: $Zapytanie" -ForegroundColor Cyan
    Write-Host "⏳ Przetwarzanie..." -ForegroundColor Yellow
    
    $response = Invoke-RestMethod -Uri $functionUrl -Method POST -Body $payload -Headers $headers
    
    Write-Host "`n📊 Odpowiedź analityka:" -ForegroundColor Green
    Write-Host "=" * 80 -ForegroundColor Green
    Write-Host $response.result -ForegroundColor White
    Write-Host "=" * 80 -ForegroundColor Green
    
} catch {
    Write-Host "❌ Błąd: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        Write-Host "Status Code: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
    }
}

Write-Host "`n💡 Przykłady innych pytań:" -ForegroundColor Magenta
Write-Host ".\analityk.ps1 'Jakie trendy w biżuterii są popularne w 2025?'"
Write-Host ".\analityk.ps1 'Jak przeanalizować konkurencję w branży jubilerskiej?'"
Write-Host ".\analityk.ps1 'Jakie kanały marketingowe są najefektywniejsze dla biżuterii?'"
