# Asystent EPIR – Multiagentowy System dla Jubilerstwa i E-commerce

## Opis projektu
System wspiera zarządzanie sklepem jubilerskim EPIR Art Jewellery: analityka, automatyzacja kampanii, obsługa klienta, RAG z danymi firmowymi, integracje AI/Shopify/Google Ads/Analytics. Architektura oparta o Firebase, Genkit, Next.js, Google Cloud, ADK, Vertex AI.

## Kluczowe technologie
- **Backend:** Firebase Functions (Node.js), Genkit, Google Cloud, ADK, Vertex AI
- **Frontend:** Next.js (TypeScript)
- **Baza danych:** Firestore, Storage
- **Integracje:** Shopify API, Google Ads API, Google Analytics API
- **AI:** Supervisor-Worker (Genkit/Vertex AI), RAG na danych firmowych

## Struktura katalogów
```
/backend         # API, funkcje serverless, integracje (Shopify, Google Ads, Analytics, Vertex AI)
/frontend        # Next.js, dashboard, chat, menedżer produktów
/agents          # Multiagentowy system (Genkit), agent kampanii, obsługi klienta, analityki, designu
/data            # Baza produktów, kamieni, projektów, klientów, marketingu
/config          # .env, klucze, ustawienia Firebase/Google Cloud/Shopify
/docs            # Dokumentacja, architektura, roadmapa, API
/scripts         # Narzędzia: migracje, backup, generowanie embeddingów
/tests           # Testy jednostkowe/integracyjne/E2E
```

## Proces uruchomienia
1. Skonfiguruj Firebase (`firebase init`)
2. Ustaw zmienne środowiskowe w `.env` (patrz przykłady w `config/.env.example`)
3. Zainstaluj zależności backendu:  
   ```bash
   cd backend && pip install -r requirements.txt
   ```
4. Zainstaluj frontend:
   ```bash
   cd frontend && npm install
   ```
5. Uruchom lokalne emulatory Firebase:
   ```bash
   firebase emulators:start
   ```
6. Uruchom dashboard Next.js:
   ```bash
   cd frontend && npm run dev
   ```
7. Deploy do chmury:
   ```bash
   firebase deploy --only functions,hosting
   ```

## Konfiguracja .env (przykład)
```
SHOPIFY_STORE_URL=twojsklep.myshopify.com
SHOPIFY_ACCESS_TOKEN=...
GOOGLE_ADS_CUSTOMER_ID=...
GOOGLE_ADS_DEVELOPER_TOKEN=...
OPENAI_API_KEY=...
```
Klucze **nie powinny być commitowane**.

## Funkcje systemu
- Analityka i raportowanie (Google Analytics, BigQuery, Firestore)
- Automatyzacja kampanii (Google Ads, alerty ROAS, optymalizacja budżetów)
- Agent obsługi klienta (RAG, rekomendacje produktów, inspiracje, certyfikaty autentyczności)
- Integracja z Shopify (webhooki zamówień, stany magazynowe, synchronizacja opisów)
- AI designer (generowanie inspiracji, automatyczne opisy, analiza trendów jubilerskich)
- Performance – optymalizacja zapytań, indeksy Firestore, CDN dla obrazów
- Security – role-based access, AppCheck, Secret Manager dla API keys

## Przykładowe API (backend)
- `/api/products` – CRUD produktów, obsługa wariantów i materiałów
- `/api/campaigns` – zarządzanie kampaniami Google Ads
- `/api/analytics` – raporty, monitoring konwersji
- `/api/chat` – endpointy dla agenta klienta
- `/api/webhooks/shopify/*` – obsługa webhooków Shopify

## Konwencje kodowania
- Python: snake_case, type hints, czyste funkcje, modularność
- JS/TS: opisowe nazwy, komponenty React, Context API
- Komentarze w języku polskim, szczególnie przy logice jubilerskiej (kamienie, materiały, obróbka)

## Optymalizacje i zalecenia
- Rozwijaj backend lokalnie na emulatorach Firebase (bez kosztów).
- Dane do RAG trzymaj w `/data/` jako JSON/CSV, embeddingi w `/data/embeddings/`
- Kluczowe funkcje AI przez Genkit/Vertex AI (nie custom).
- Zawsze obsługuj błędy API (Shopify, Google Ads).
- Przyszłościowo: fine-tuning/Lora na własnych danych, migracja do Firestore/Storage przy wdrożeniu bota.

## Dokumentacja
- [docs/API.md](docs/API.md) – opis endpointów REST
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) – diagramy systemu
- [docs/AGENTS.md](docs/AGENTS.md) – logika agentów
- [docs/ROADMAP.md](docs/ROADMAP.md) – plan rozwoju

## Kontakt
Właściciel: Krzysztof Dzugaj  
Mail: KrzysztofDzugaj@gmail.com

---
**Uwaga:** Repozytorium służy rozwojowi systemu, każda zmiana powinna być zatwierdzana przez właściciela. Decyzje i ustalenia notować na bieżąco w plikach projektu.
