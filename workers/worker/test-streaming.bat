@echo off
REM Generated test command - streaming

curl.exe -N -X POST "https://epir-art-jewellery-worker.krzysztofdzugaj.workers.dev/chat?shop=dev-store.myshopify.com&timestamp=1759531106&signature=466a76f9ed5611296d60fd20b4b01420e74088259d6e238d4722452c442eaa0d" -H "Content-Type: application/json" --data-raw "{\"message\":\"Opowiedz krotko o jubilerstwie\",\"stream\":true}"
