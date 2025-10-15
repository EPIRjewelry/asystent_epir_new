import streamlit as st
import requests
import json
from datetime import datetime, timezone

st.set_page_config(page_title="MCP Admin", layout="wide")

st.title("MCP Admin — prosty interfejs (Streamlit)")

# Sidebar: connection settings
st.sidebar.header("Połączenie")
default_url = st.sidebar.text_input("MCP URL", value="http://localhost:8787/mcp")
default_token = st.sidebar.text_input("Bearer token (MCP_SERVER_AUTH_TOKEN)", type="password")

if "history" not in st.session_state:
    st.session_state.history = []

if "tools" not in st.session_state:
    st.session_state.tools = []

headers = {
    "Content-Type": "application/json"
}
if default_token:
    headers["Authorization"] = f"Bearer {default_token}"

# Helper function to call a tool and handle response/history
def call_mcp_tool(tool_name, args):
    payload = {
        "jsonrpc": "2.0",
        "id": datetime.now().timestamp(),
        "method": "tools/call",
        "params": { "name": tool_name, "arguments": args }
    }
    try:
        r = requests.post(default_url, headers=headers, json=payload, timeout=60)
        try:
            resp = r.json()
        except Exception:
            resp = {"raw_text": r.text, "status_code": r.status_code}

        entry = {
            "time": datetime.now(timezone.utc).isoformat(),
            "tool": tool_name,
            "request": payload,
            "response": resp,
            "status_code": r.status_code
        }
        st.session_state.history.insert(0, entry)

        if r.ok and isinstance(resp, dict) and resp.get("result"):
            st.success(f"Wywołanie '{tool_name}' powiodło się")
            st.json(resp)
        else:
            st.error(f"Błąd wywołania '{tool_name}': HTTP {r.status_code}")
            st.write(resp)
    except Exception as e:
        st.error(f"Błąd podczas wywołania narzędzia '{tool_name}': {e}")

col1, col2 = st.columns([2, 3])

with col1:
    st.subheader("Szybkie akcje (Presety)")
    with st.expander("Zarządzanie KV i Promptami", expanded=True):
        # Preset for getSystemPrompt
        if st.button("Pokaż System Prompt"):
            call_mcp_tool("getSystemPrompt", {})

        # Preset for getKVFlag
        kv_key_get = st.text_input("Klucz KV do pobrania", "SYSTEM_PROMPT")
        if st.button("Pobierz z KV"):
            if kv_key_get:
                call_mcp_tool("getKVFlag", {"key": kv_key_get})
            else:
                st.warning("Podaj klucz KV do pobrania.")

        # Preset for setKVFlag
        st.markdown("---")
        kv_key_set = st.text_input("Klucz KV do zapisu", "SYSTEM_PROMPT")
        kv_value_set = st.text_area("Wartość KV do zapisu", "")
        if st.button("Zapisz w KV"):
            if kv_key_set and kv_value_set:
                call_mcp_tool("setKVFlag", {"key": kv_key_set, "value": kv_value_set})
            else:
                st.warning("Podaj klucz i wartość do zapisu w KV.")

    with st.expander("AI Chat & Worker Deployment", expanded=True):
        st.markdown("#### Rozmowa z AI")
        ai_prompt = st.text_area("Wpisz prompt dla AI", "Napisz prosty skrypt Cloudflare Worker, który zwraca 'hello world'", height=100)

        # Model selector: presets + custom override
        preset_models = [
            "@cf/meta/llama-2-7b-chat-fp16",
            "@cf/meta/llama-2-13b-chat-fp16",
            "@cf/baai/bge-large-en-v1.5",
            "openai/gpt-4o-mini",
            "openai/gpt-4o",    
        ]
        selected_model = st.selectbox("Wybierz model (preset)", ["(use custom below)"] + preset_models)
        custom_model = st.text_input("LUB wpisz własny identyfikator modelu (np. openai/gpt-4)")

        # Decide which model to use: custom overrides preset
        model_to_use = custom_model.strip() if custom_model and custom_model.strip() else (None if selected_model == "(use custom below)" else selected_model)

        if st.button("Wyślij do AI"):
            if ai_prompt:
                args = {"prompt": ai_prompt}
                if model_to_use:
                    args["model"] = model_to_use
                call_mcp_tool("aiChat", args)
            else:
                st.warning("Wpisz treść promptu.")

        st.markdown("---")
        st.markdown("#### Wdrożenie Workera z kodu")
        worker_name = st.text_input("Nazwa nowego Workera (skryptu)")
        worker_code = st.text_area("Kod JavaScript/TypeScript dla Workera", height=250)
        
        # Opcje bezpieczeństwa
        dry_run = st.checkbox("Dry Run (tylko walidacja, bez wdrożenia)", value=True)
        confirm_deploy = st.checkbox("Potwierdź wdrożenie (wymagane, jeśli Dry Run jest odznaczone)")

        if st.button("Stwórz i wdróż Workera"):
            if worker_name and worker_code:
                if not dry_run and not confirm_deploy:
                    st.error("Musisz zaznaczyć 'Potwierdź wdrożenie', aby wykonać rzeczywiste wdrożenie.")
                else:
                    params = {
                        "script_name": worker_name,
                        "script_code": worker_code,
                        "dryRun": dry_run,
                        "confirm": confirm_deploy
                    }
                    call_mcp_tool("createWorkerFromCode", params)
            else:
                st.warning("Podaj nazwę i kod dla nowego Workera.")

    with st.expander("Zarządzanie Cron Triggers"):
        # Preset for listCronTriggers
        if st.button("Wyświetl Cron Triggers"):
            call_mcp_tool("listCronTriggers", {})

    st.subheader("Narzędzia MCP")
    if st.button("Pobierz listę narzędzi (tools/list)"):
        payload = {"jsonrpc": "2.0", "id": 1, "method": "tools/list"}
        try:
            r = requests.post(default_url, headers=headers, json=payload, timeout=20)
            r.raise_for_status()
            resp = r.json()
            tools = resp.get("result", {}).get("tools", [])
            st.session_state.tools = tools
            st.success(f"Pobrano {len(tools)} narzędzi")
            st.write("Lista narzędzi:")
            for t in tools:
                st.markdown(f"**{t.get('name')}** — {t.get('description')}")
        except Exception as e:
            st.error(f"Błąd podczas pobierania listy narzędzi: {e}")
            st.write(r.text if 'r' in locals() else "")

    if st.session_state.tools:
        tool_names = [t["name"] for t in st.session_state.tools]
        selected = st.selectbox("Wybierz narzędzie do wywołania", tool_names)
        tool = next((t for t in st.session_state.tools if t["name"] == selected), None)

        if tool:
            st.markdown("**Opis:**")
            st.write(tool.get("description", "-"))
            st.markdown("**Schema wejściowe (JSON):**")
            st.code(json.dumps(tool.get("inputSchema", {}), indent=2, ensure_ascii=False), language='json')

            default_args = {}
            # Przygotuj prosty placeholder na podstawie schema (jeśli dostępne)
            props = tool.get("inputSchema", {}).get("properties", {})
            for k, v in props.items():
                if v.get("type") == "string":
                    default_args[k] = ""
                elif v.get("type") == "number":
                    default_args[k] = 0
                elif v.get("type") == "boolean":
                    default_args[k] = False
                elif v.get("type") == "array":
                    default_args[k] = []
                else:
                    default_args[k] = None

            args_text = st.text_area("Argumenty (JSON)", value=json.dumps(default_args, indent=2, ensure_ascii=False), height=200)

            if st.button("Wywołaj narzędzie (tools/call)"):
                try:
                    parsed_args = json.loads(args_text) if args_text.strip() else {}
                    call_mcp_tool(selected, parsed_args)
                except Exception as e:
                    st.error(f"Nieprawidłowy JSON w argumentach: {e}")


with col2:
    st.subheader("Historia wywołań")
    if st.session_state.history:
        for h in st.session_state.history[:20]:
            with st.expander(f"{h['time']} — {h['tool']} (HTTP {h.get('status_code')})", expanded=False):
                st.markdown("**Request**")
                st.code(json.dumps(h['request'], indent=2, ensure_ascii=False), language='json')
                st.markdown("**Response**")
                st.code(json.dumps(h['response'], indent=2, ensure_ascii=False), language='json')
    else:
        st.info("Brak historii — wykonaj najpierw pobranie listy narzędzi lub wywołanie narzędzia.")

st.sidebar.markdown("---")
st.sidebar.write("Uwaga: To prosty admin UI do testów. Nie przechowuj w nim produkcyjnych tokenów bez odpowiedniego zabezpieczenia.")
