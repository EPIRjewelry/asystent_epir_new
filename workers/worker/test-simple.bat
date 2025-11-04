@echo off
REM Simple test without HMAC for debugging

echo Testing simple POST without signature...
curl.exe -i -X POST "https://epir-art-jewellery-worker.krzysztofdzugaj.workers.dev/chat?shop=test.myshopify.com&timestamp=123&signature=abc" -H "Content-Type: application/json" --data-raw "{\"message\":\"test\",\"stream\":false}"

echo.
echo.
echo Testing with proper JSON escaping...
curl.exe -i -X POST "https://epir-art-jewellery-worker.krzysztofdzugaj.workers.dev/chat?shop=test.myshopify.com&timestamp=123&signature=abc" -H "Content-Type: application/json" -d "{\"message\":\"hello\",\"stream\":false}"
