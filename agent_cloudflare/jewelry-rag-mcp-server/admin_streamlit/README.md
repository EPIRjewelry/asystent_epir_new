MCP Admin — Streamlit

This is a tiny Streamlit admin UI to interact with the MCP JSON-RPC endpoint of your Cloudflare Worker.

Files
- `app.py` — main Streamlit app
- `requirements.txt` — Python deps

Run (PowerShell on Windows)

1. Create a Python virtual environment (optional but recommended):

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

2. Install dependencies:

```powershell
python -m pip install -r admin_streamlit\requirements.txt
```

3. Run the app:

```powershell
streamlit run admin_streamlit\app.py
```

Notes
- Default URL is `http://localhost:8787/mcp` for local `wrangler dev`. Change to your deployed worker URL (e.g. `https://jewelry-rag-mcp-server.<workers>.dev/mcp`) when testing production.
- Provide the `MCP_SERVER_AUTH_TOKEN` value in the sidebar to authenticate.
- This is a minimal test tool — do not expose to the public without adding authentication and HTTPS.
