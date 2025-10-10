# Google Cloud Pub/Sub — notatka dla projektu EPIR

Data: 2025-10-06

Krótko: notatka wyjaśniająca czym jest Google Cloud Pub/Sub, jak Shopify publikuje webhooki do Pub/Sub oraz co oznacza konto usługi `delivery@shopify-pubsub-webhooks.iam.gserviceaccount.com`. Zawiera też kroki konfiguracji i przykładowe komendy `gcloud` (PowerShell).

## Co to jest Google Cloud Pub/Sub?
- Pub/Sub to usługa komunikatów publish/subscribe w GCP.
- Publisher (np. Shopify) publikuje wiadomości do topicu.
- Subscriber (Twój backend, Cloud Function, Cloud Run itp.) pobiera wiadomości ze subskrypcji i je przetwarza.

## Adres konta usługi Shopify
- `delivery@shopify-pubsub-webhooks.iam.gserviceaccount.com` to konto usługi (service account) używane przez Shopify do publikowania wiadomości do Twojego topicu.
- Musisz nadać temu kontu rolę `roles/pubsub.publisher` dla konkretnego topicu (zasada least privilege).

## Dlaczego to jest potrzebne?
- Shopify potrzebuje "tożsamości" by zautoryzować publikowanie do Twojego Pub/Sub. Nadając uprawnienia temu service accountowi, pozwalasz Shopify wysyłać eventy bez udostępniania jakichkolwiek Twoich poświadczeń.

## Główne kroki konfiguracji
1. Utwórz topic w projekcie GCP.
2. Nadaj konto `delivery@shopify-pubsub-webhooks.iam.gserviceaccount.com` rolę Publisher tylko dla tego topicu.
3. Skonfiguruj w Shopify webhook target typu Google Cloud Pub/Sub wskazując pełną nazwę topicu: `projects/PROJECT_ID/topics/TOPIC_NAME`.
4. Utwórz subskrypcję (pull lub push) aby odbierać wiadomości.
5. Testuj i monitoruj (Cloud Logging, Pub/Sub metrics).

## Komendy `gcloud` (PowerShell) — zamień PLACEHOLDERY
Zamień: `PROJECT_ID`, `TOPIC_NAME`, `SUB_NAME` na swoje wartości.

Utwórz topic:

```powershell
gcloud pubsub topics create TOPIC_NAME --project=PROJECT_ID
```

Nadaj uprawnienie dla konta Shopify (Publisher tylko na topicu):

```powershell
gcloud pubsub topics add-iam-policy-binding TOPIC_NAME `
  --member="serviceAccount:delivery@shopify-pubsub-webhooks.iam.gserviceaccount.com" `
  --role="roles/pubsub.publisher" `
  --project=PROJECT_ID
```

Sprawdź politykę IAM topicu:

```powershell
gcloud pubsub topics get-iam-policy TOPIC_NAME --project=PROJECT_ID
```

Utwórz subskrypcję typu pull:

```powershell
gcloud pubsub subscriptions create SUB_NAME --topic=TOPIC_NAME --project=PROJECT_ID
```

Pobierz (pull) wiadomości testowo (auto-ack):

```powershell
gcloud pubsub subscriptions pull SUB_NAME --limit=10 --auto-ack --project=PROJECT_ID
```

Usuń binding (jeśli chcesz cofnąć dostęp):

```powershell
gcloud pubsub topics remove-iam-policy-binding TOPIC_NAME `
  --member="serviceAccount:delivery@shopify-pubsub-webhooks.iam.gserviceaccount.com" `
  --role="roles/pubsub.publisher" `
  --project=PROJECT_ID
```

## Weryfikacja działania
- Po skonfigurowaniu webhooka w Shopify sprawdź w GCP, czy do topicu trafiają wiadomości (Cloud Console → Pub/Sub → Topic → Metrics / Logs).
- Użyj `gcloud pubsub subscriptions pull` aby odczytać przykładowe wiadomości. Payload może być base64 — zdekoduj, żeby zobaczyć body webhooka.
- W Cloud Audit Logs powinny być widoczne akcje publikowania od `delivery@shopify-pubsub-webhooks.iam.gserviceaccount.com`.

## Bezpieczeństwo / dobre praktyki
- Nadaj uprawnienia tylko do konkretnego topicu (nie na całym projekcie).
- Użyj subskrypcji pull z mechanizmami idempotencji i retry po stronie konsumenta.
- Monitoruj metryki i logi (błędy, opóźnienia, liczba wiadomości).
- Regularnie audytuj IAM bindings.

## Opcjonalne/zaawansowane
- Zamiast pull możesz użyć push-subscription z autoryzacją (OIDC) jeśli chcesz, by Pub/Sub sam wysyłał do Twojego endpointu.
- Możesz użyć Cloud Functions/Cloud Run jako konsumenta, wtedy konfiguracja jest prosta i skalowalna.
- Jeśli chcesz automatyzować infrastrukturę, przygotuję przykładowy snippet Terraform.

---
Notatka zapisana w repo: `worker/SHOPIFY_PUBSUB_NOTE.md`.

Jeśli chcesz, mogę teraz wygenerować:
- skrypt PowerShell z komendami do uruchomienia (z podmianą zmiennych), lub
- plik Terraform, który utworzy topic, subskrypcję i doda binding (minimalne uprawnienia). Powiedz którą opcję wybierasz.