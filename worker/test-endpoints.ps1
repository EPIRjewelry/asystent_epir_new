# Test script for EPIR Worker endpoints
# Usage: .\test-endpoints.ps1

$WORKER_URL = "https://epir-art-jewellery-worker.krzysztofdzugaj.workers.dev"

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "  EPIR Worker Endpoint Tests" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Green

# Test 1: Health Check
Write-Host "[1/5] Testing Health Check..." -ForegroundColor Cyan
try {
    $response = Invoke-WebRequest -Uri "$WORKER_URL/health" -Method GET -UseBasicParsing
    Write-Host "✓ Health Check: $($response.StatusCode) - $($response.Content)" -ForegroundColor Green
} catch {
    Write-Host "✗ Health Check failed: $_" -ForegroundColor Red
}

# Test 2: Ping
Write-Host "`n[2/5] Testing Ping..." -ForegroundColor Cyan
try {
    $response = Invoke-WebRequest -Uri "$WORKER_URL/ping" -Method GET -UseBasicParsing
    Write-Host "✓ Ping: $($response.StatusCode) - $($response.Content)" -ForegroundColor Green
} catch {
    Write-Host "✗ Ping failed: $_" -ForegroundColor Red
}

# Test 3: Chat Endpoint (local, no HMAC) - Non-streaming
Write-Host "`n[3/5] Testing Chat Endpoint (non-streaming)..." -ForegroundColor Cyan
try {
    $chatBody = @{
        message = "Cześć! Jakie produkty oferujecie?"
        session_id = "test-session-ps1"
        stream = $false
    } | ConvertTo-Json
    
    $response = Invoke-WebRequest -Uri "$WORKER_URL/chat" -Method POST -Body $chatBody -ContentType "application/json" -UseBasicParsing -TimeoutSec 30
    $result = $response.Content | ConvertFrom-Json
    Write-Host "✓ Chat Response (status $($response.StatusCode)):" -ForegroundColor Green
    Write-Host "  Session ID: $($result.session_id)" -ForegroundColor Yellow
    Write-Host "  Reply: $($result.reply)" -ForegroundColor Yellow
} catch {
    Write-Host "✗ Chat failed: $_" -ForegroundColor Red
}

# Test 4: MCP Tools List
Write-Host "`n[4/5] Testing MCP Tools List..." -ForegroundColor Cyan
try {
    $mcpListBody = @{
        jsonrpc = "2.0"
        method = "tools/list"
        id = 1
    } | ConvertTo-Json
    
    $response = Invoke-WebRequest -Uri "$WORKER_URL/mcp/tools/call" -Method POST -Body $mcpListBody -ContentType "application/json" -UseBasicParsing -TimeoutSec 15
    $result = $response.Content | ConvertFrom-Json
    Write-Host "✓ MCP Tools List (status $($response.StatusCode)):" -ForegroundColor Green
    if ($result.result.tools) {
        Write-Host "  Available tools:" -ForegroundColor Yellow
        foreach ($tool in $result.result.tools) {
            Write-Host "    - $($tool.name): $($tool.description)" -ForegroundColor Gray
        }
    } else {
        Write-Host "  Response: $($response.Content)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "✗ MCP Tools List failed: $_" -ForegroundColor Red
}

# Test 5: MCP Product Search
Write-Host "`n[5/5] Testing MCP Product Search..." -ForegroundColor Cyan
try {
    $mcpSearchBody = @{
        jsonrpc = "2.0"
        method = "tools/call"
        params = @{
            name = "search_shop_catalog"
            arguments = @{
                query = "pierścionek"
                first = 3
            }
        }
        id = 2
    } | ConvertTo-Json -Depth 5
    
    $response = Invoke-WebRequest -Uri "$WORKER_URL/mcp/tools/call" -Method POST -Body $mcpSearchBody -ContentType "application/json" -UseBasicParsing -TimeoutSec 20
    $result = $response.Content | ConvertFrom-Json
    Write-Host "✓ MCP Product Search (status $($response.StatusCode)):" -ForegroundColor Green
    if ($result.result) {
        Write-Host "  Result:" -ForegroundColor Yellow
        Write-Host "  $($result.result.content[0].text.Substring(0, [Math]::Min(200, $result.result.content[0].text.Length)))..." -ForegroundColor Gray
    } else {
        Write-Host "  Response: $($response.Content.Substring(0, [Math]::Min(200, $response.Content.Length)))..." -ForegroundColor Yellow
    }
} catch {
    Write-Host "✗ MCP Product Search failed: $_" -ForegroundColor Red
}

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "  Tests Complete" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
