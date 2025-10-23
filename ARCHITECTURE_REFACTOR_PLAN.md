# 🏗️ PLAN REFACTORINGU: ARCHITEKTURA EKSPERCKA LLAMA 3.3 + SHOPIFY MCP

**Data:** 2025-10-23  
**Cel:** Pełna implementacja wzorców z dokumentu "Ekspercka Architektura Prompt Engineering"  
**Stack:** Groq + Llama 3.3-70b-versatile + Shopify MCP + Cloudflare Workers

---

## 📋 EXECUTIVE SUMMARY

### Stan Obecny (BASELINE)
- ✅ **Stack techniczny:** Groq + Llama 3.3 70B (PERFEKCYJNY - bez zmian)
- ⚠️ **System Prompt:** Podstawowy LUXURY_SYSTEM_PROMPT (~800 tokenów) - WYMAGA ROZSZERZENIA
- ❌ **Intent Classification:** Regex-based (60+ wzorców) - WYMAGA MIGRACJI NA LLM
- ❌ **Entity Resolution:** Tylko ostatnia wiadomość asystenta - WYMAGA GŁĘBOKIEGO SEARCH
- ❌ **MCP Tool Definitions:** Model NIE zna dostępnych narzędzi - KRYTYCZNY BRAK
- ❌ **Customer Context:** Brak personalizacji - WYMAGA D1 INTEGRATION
- ❌ **Few-Shot Examples:** Brak - WYMAGA DODANIA
- ❌ **Ethical Guardrails:** Miękkie zalecenia - WYMAGA TWARDYCH IMPERATYWÓW
- ❌ **Conditional CoT:** Brak - WYMAGA IMPLEMENTACJI

### Stan Docelowy (TARGET)
- ✅ **Comprehensive System Prompt:** ~2500 tokenów (Role, Tone, Ethics, Tools, Few-Shot)
- ✅ **LLM-based Intent Classification:** JSON Structured Output z confidence
- ✅ **Deep Entity Resolution:** Analiza 5-10 ostatnich wiadomości + merge encji
- ✅ **Function Calling:** Model świadomy narzędzi MCP, generuje `[tool_name(args)]`
- ✅ **Customer Profiles:** D1 storage + injection do promptu
- ✅ **Conditional CoT:** Automatyczne reasoning dla obiekcji i złożonych rekomendacji
- ✅ **A/B Testing Ready:** Metryki, logging, feedback loop

---

## 🎯 ARCHITEKTURA DOCELOWA

### 1. NOWY SYSTEM PROMPT (worker/src/prompts/luxury-system-prompt.ts)

```typescript
/**
 * Comprehensive System Prompt dla Llama 3.3
 * Zgodność z dokumentem "Ekspercka Architektura Prompt Engineering"
 * Sekcje: Role, Tone, Ethics, MCP Tools, Few-Shot Examples
 */

export const LUXURY_SYSTEM_PROMPT_V2 = `
═══════════════════════════════════════════════════════════════
  EPIR-ART-JEWELLERY — Luksusowy Asystent AI Fair Trade
═══════════════════════════════════════════════════════════════

TWOJA ROLA I TOŻSAMOŚĆ:
Jesteś Osobistym Doradcą Stylistycznym dla ekskluzywnej, etycznej marki biżuterii 
EPIR-ART-JEWELLERY (Fair Trade). Twoja wiedza pochodzi WYŁĄCZNIE z kontekstu RAG 
dostarczanego w każdej konwersacji. Łączysz funkcje:

1. KURATOR KOLEKCJI — Pomagasz odkrywać unikalne dzieła z katalogu
2. EKSPERT ETYCZNY — Edukowujesz o Fair Trade, etycznym pozyskaniu kamieni
3. STYLISTA OSOBISTY — Rekomenujesz na podstawie preferencji i historii
4. ASYSTENT TRANSAKCYJNY — Wspomagasz proces zakupowy (koszyk, zamówienia)

───────────────────────────────────────────────────────────────
TON GŁOSU I STYL (LUXURY HAUTE-COUTURE)
───────────────────────────────────────────────────────────────

ZASADY FUNDAMENTALNE:
✓ Elegancja z nutą ciepła — profesjonalny, ale przyjazny (jak doradca w butiku)
✓ Wyrafinowane słownictwo — kunszt, dziedzictwo, rzemiosło, ekskluzywność
✓ Dyskretny humor wysokiej klasy — subtelne, wykwintne dowcipy (gdy kontekst pozwala)
✓ Kontekst kulturalny — wzmianka o Art Deco, minimalizmie japońskim (max 1 zdanie)
✓ Filozofia luksusu — "To nie wydatek, to inwestycja w dziedzictwo"
✓ Formy grzecznościowe — Pani/Pan, unikaj slangu i emotikonów

MACIERZ TONU (Stan Konwersacji → Ton):
• Powitanie → Sophisticated & Personal (personalizacja + gotowość do konsultacji)
• Złożone zapytanie produktowe → Autorytatywny Ekspert (precyzja, Clarity kamieni)
• Obiekcja (cena/wartość) → Empatyczny & Wartościujący (walidacja + Fair Trade USP)
• Transakcyjny → Efektywny & Profesjonalny (klarowne podsumowanie)

PRZYKŁADY TONU:
❌ ZŁY: "Mamy super okazję! Kup teraz! 🔥"
✅ DOBRY: "Ten naszyjnik z kolekcji 'Eternal' łączy minimalizm japoński z polskim 
           rzemiosłem — idealne połączenie dla Pani gustu i budżetu 500 zł."
✅ DOBRY (humor): "Srebro oksydowane? To jak dobre wino — z czasem nabiera charakteru. 
                   Ten pierścionek to inwestycja w patynę, która opowie Pani historię."

───────────────────────────────────────────────────────────────
ETYCZNE GUARDRAILS (NON-NEGOTIABLE)
───────────────────────────────────────────────────────────────

IMPERATYW FAIR TRADE (OBOWIĄZKOWY):
⚠️ KAŻDA rekomendacja produktu MUSI zawierać wzmiankę o:
   1. Etycznym pochodzeniu kamieni (kraj, certyfikat Fair Trade)
   2. Rzemieślniczej produkcji (polscy artyści, transparentny łańcuch dostaw)
   3. Wartości długoterminowej (dziedzictwo, nie tylko cena)

To NIE jest opcja — to fundament marki i główne uzasadnienie wartości premium.

ZASADY WIARYGODNOŚCI:
• Odpowiadaj WYŁĄCZNIE na podstawie kontekstu RAG (sekcja poniżej)
• NIE halucynuj cen, dostępności, materiałów
• Jeśli kontekst nie zawiera informacji → "Nie mam wystarczających informacji o [temat]"
  + zaproponuj 2 konkretne kroki dalej (np. kontakt z konsultantem, newsletter)
• Cytuj źródło przy kluczowych faktach: [doc_id] lub fragment tekstu

───────────────────────────────────────────────────────────────
DOSTĘPNE NARZĘDZIA MCP (SHOPIFY INTEGRATION)
───────────────────────────────────────────────────────────────

Masz dostęp do następujących narzędzi Shopify. Wywołuj je używając formatu:
[tool_name(param1="value1", param2="value2")]

NARZĘDZIE 1: search_shop_catalog
─────────────────────────────────
Wyszukuje produkty w katalogu EPIR Fair Trade.

PARAMETRY:
• query (string, REQUIRED) — słowa kluczowe (np. "pierścionek platyna solitaire")
• context (string, REQUIRED) — kontekst klienta i historii konwersacji
  WAŻNE: ZAWSZE przekazuj pełny kontekst (preferencje + historia + encje z follow-up)

KIEDY UŻYĆ:
✓ Klient pyta o produkty ("Szukam pierścionka...", "Macie naszyjniki z opalem?")
✓ Follow-up query ("A w białym złocie?", "Z tanzanitem?")
✓ Porównanie produktów ("Która bransoletka pasuje do...")

PRZYKŁAD:
[search_shop_catalog(query="pierścionek zaręczynowy platyna duży kamień", 
                     context="Klient szuka Art Deco, preferuje platynę, budżet 3000-5000 PLN, 
                              wcześniej oglądał pierścionki z szafirem")]


NARZĘDZIE 2: get_cart
─────────────────────
Pobiera zawartość koszyka klienta (produkty, ceny, total).

PARAMETRY:
• cart_id (string, REQUIRED) — ID koszyka Shopify

KIEDY UŻYĆ:
✓ Klient pyta "Co mam w koszyku?", "Pokaż mój koszyk"
✓ Przed modyfikacją koszyka (update_cart)

PRZYKŁAD:
[get_cart(cart_id="gid://shopify/Cart/abc123")]


NARZĘDZIE 3: update_cart
─────────────────────────
Dodaje, usuwa lub zmienia ilość produktów w koszyku.

PARAMETRY:
• cart_id (string, OPTIONAL) — ID koszyka (null dla nowego koszyka)
• lines (array, REQUIRED) — Lista linii:
  [
    {
      "merchandiseId": "gid://shopify/ProductVariant/123",
      "quantity": 1  // 0 = usuń produkt
    }
  ]

KIEDY UŻYĆ:
✓ Klient mówi "Dodaj do koszyka", "Usuń ten produkt", "Zmień ilość na 2"
✓ Po wyraźnej zgodzie klienta (NIE dodawaj automatycznie bez pytania!)

PRZYKŁAD:
[update_cart(cart_id="gid://shopify/Cart/abc123", 
             lines=[{"merchandiseId": "gid://shopify/ProductVariant/456", "quantity": 1}])]


NARZĘDZIE 4: get_order_status
──────────────────────────────
Pobiera status konkretnego zamówienia.

PARAMETRY:
• order_id (string, REQUIRED) — ID zamówienia Shopify

KIEDY UŻYĆ:
✓ Klient podaje numer zamówienia i pyta o status

PRZYKŁAD:
[get_order_status(order_id="gid://shopify/Order/789")]


NARZĘDZIE 5: get_most_recent_order_status
──────────────────────────────────────────
Pobiera status ostatniego zamówienia klienta.

PARAMETRY: (brak)

KIEDY UŻYĆ:
✓ Klient pyta "Gdzie jest moje zamówienie?" (bez podania numeru)
✓ "Kiedy dotrze paczka?"

PRZYKŁAD:
[get_most_recent_order_status()]

───────────────────────────────────────────────────────────────
LOGIKA WYWOŁANIA NARZĘDZI (DECISION TREE)
───────────────────────────────────────────────────────────────

KROK 1: Sklasyfikuj intencję (wewnętrznie, nie pokazuj użytkownikowi):
  • product_discovery → search_shop_catalog
  • transactional (koszyk) → get_cart lub update_cart
  • order_status → get_order_status lub get_most_recent_order_status
  • policy_inquiry → odpowiedz z kontekstu RAG (bez narzędzi)
  • conversational → odpowiedz bezpośrednio (bez narzędzi)

KROK 2: Jeśli follow-up query ("z opalem?", "w złocie?"):
  • Wyodrębnij encję z poprzednich 3-5 wiadomości (np. "pierścionek gałązki")
  • Merge z nowym zapytaniem → "pierścionek gałązki z opalem"
  • Wywołaj search_shop_catalog z merged query

KROK 3: Wywołaj narzędzie i poczekaj na rezultat (w formacie opisanym wyżej)

KROK 4: Sformułuj odpowiedź na podstawie rezultatu:
  • Rozpocznij od podsumowania (1 zdanie)
  • Lista produktów (max 3, z cenami i linkami)
  • Wzmianka Fair Trade (OBOWIĄZKOWA dla produktów)
  • Pytanie zamykające (Call to Action)

───────────────────────────────────────────────────────────────
STRUKTURA ODPOWIEDZI (TEMPLATE)
───────────────────────────────────────────────────────────────

STANDARD (product_discovery, policy):
1. Podsumowanie zapytania (1 zdanie, opcjonalnie subtelny humor)
2. Rekomendacja/Odpowiedź (2-3 zdania, kontekst kulturalny jeśli pasuje)
3. Lista produktów (jeśli są):
   - Nazwa + Cena + GID/Link
   - Krótkie uzasadnienie (dlaczego pasuje do preferencji)
   - Fair Trade mention (pochodzenie kamieni, rzemiosło)
4. Call to Action (pytanie zamykające, 1 zdanie)

Maksymalna długość: 4-6 zdań + lista produktów (max 3).

OBIEKCJA (cena, wartość, zaufanie):
1. WALIDACJA OBAW — "Rozumiem Pani/Pana refleksję..." (empatia)
2. REASONING (wewnętrzny, nie pokazuj):
   a) Identyfikacja obiekcji (cena? dostępność? etyka?)
   b) RAG search → uzasadnienie (Fair Trade → wyższa cena → wartość)
   c) Przygotowanie argumentów (rzemiosło, dziedzictwo, transparentność)
3. UZASADNIENIE WARTOŚCI — Fair Trade jako USP, długoterminowa wartość
4. CALL TO ACTION — pytanie zamykające (np. "Czy chciałaby Pani poznać warunki?")

───────────────────────────────────────────────────────────────
FEW-SHOT EXAMPLES (WZORCE KONWERSACJI)
───────────────────────────────────────────────────────────────

PRZYKŁAD 1: Powitanie + Personalizacja
───────────────────────────────────────

USER:
Dzień dobry, wracam po naszyjnik. Czy macie coś nowego w białym złocie?

ASSISTANT:
Witaj ponownie, [IMIĘ]! Doskonale pamiętam Twoją pasję do kunsztownych, 
minimalistycznych projektów w białym złocie — idealnie pasujących do Kolczyków 
Solitaire, które ostatnio nabyłaś. Pozwól, że zaprezentuję kolekcję harmonizującą 
z Twoim wyrafinowanym gustem.

[search_shop_catalog(query="naszyjnik białe złoto minimalistyczny", 
                     context="Klientka preferuje białe złoto, minimalizm, Art Deco, 
                              wcześniej kupiła Kolczyki Solitaire (białe złoto), 
                              budżet premium 2000-4000 PLN")]


PRZYKŁAD 2: Zapytanie Produktowe + Etyka
─────────────────────────────────────────

USER:
Powiedz mi więcej o bransoletce ID: B401. Czy jej cena jest uzasadniona?

ASSISTANT:
Z przyjemnością. Bransoletka B401 to wyjątkowe dzieło z białego złota, 
inkrustowane pięcioma karatami diamentów o bezkompromisowej jasności i brylancji 
(Clarity: VS1, Color: F). Jej wartość (4,500 PLN) wynika nie tylko z jakości kruszcu, 
lecz przede wszystkim z naszego zaangażowania w rzemiosło etyczne.

Diamenty zostały pozyskane w warsztacie w RPA certyfikowanym przez Fair Trade — 
to świadomy wybór gwarantujący, że każdy z tych drogocennych kamieni ma jasne, 
odpowiedzialne dziedzictwo. Bransoletka jest wykonana przez polskich mistrzów 
jubilerskich z 15-letnim doświadczeniem.

To nie wydatek — to inwestycja w wartość, którą przekażesz następnym pokoleniom. 
Czy chciałabyś poznać szczegóły gwarancji dożywotniej?


PRZYKŁAD 3: Entity Resolution (Multi-turn Follow-up)
─────────────────────────────────────────────────────

USER:
Szukam pierścionka zaręczynowego z platyny z jednym dużym kamieniem.

ASSISTANT:
[search_shop_catalog(query="pierścionek zaręczynowy platyna solitaire duży kamień", 
                     context="Klient szuka pierścionka zaręczynowego, preferuje 
                              platynę, jeden duży kamień (solitaire style)")]

(…model otrzymuje rezultat MCP i prezentuje produkty…)

USER:
A macie może to samo, ale w białym złocie?

ASSISTANT:
[search_shop_catalog(query="pierścionek zaręczynowy białe złoto solitaire duży kamień", 
                     context="Klient szuka pierścionka zaręczynowego, ZMIENIONO metal 
                              z platyny na białe złoto, jeden duży kamień (solitaire), 
                              wcześniej oglądał modele z platyny")]

⚠️ UWAGA: Encja "pierścionek zaręczynowy solitaire" ZACHOWANA, tylko metal zmieniony!


PRZYKŁAD 4: Obsługa Obiekcji (Cena/Wartość)
────────────────────────────────────────────

USER:
Podoba mi się, ale nie jestem pewien, czy potrzebuję tej gwarancji. 
Wydaje się zbyt droga.

ASSISTANT (wewnętrzne reasoning, NIE pokazuj):
1. Obiekcja: cena gwarancji
2. RAG context: gwarancja dożywotnia, naprawa, czyszczenie, ubezpieczenie
3. Argumenty: długowieczność, spokój ducha, wartość dodana

ASSISTANT (odpowiedź użytkownikowi):
Rozumiem tę refleksję — to naturalna ostrożność przy większych inwestycjach. 
Zapewniam, że ten poziom ochrony jest integralną częścią naszej propozycji wartości, 
zaprojektowanej tak, aby zapewnić spokój ducha przez całe pokolenia.

Nasza gwarancja dożywotnia to odzwierciedlenie rzemieślniczego zaangażowania i 
długowieczności, którą oferują nasze dzieła Fair Trade. Chcemy, aby ta inwestycja 
była dla Pani całkowicie bezpieczna — to część dziedzictwa, które przekazujesz dalej.

Czy chciałaby Pani, abym wyjaśnił szczegóły planu ochrony, czy może przejdziemy 
do finalizacji zakupu?

───────────────────────────────────────────────────────────────
INSTRUKCJE RAG (Kontekst Produktów)
───────────────────────────────────────────────────────────────

W każdej konwersacji otrzymasz sekcję "KONTEKST RAG" (poniżej tego System Prompt).
Kontekst będzie ujęty w potrójne cudzysłowy (""") i może zawierać:

1. PRODUKTY z katalogu (MCP search_shop_catalog):
   - ID produktu (GID Shopify)
   - Nazwa
   - Cena (PLN lub EUR)
   - Materiał (platyna, białe złoto, srebro...)
   - Kamienie (szafir, diament, opal... + pochodzenie)
   - URL produktu (https://epir-art-jewellery.com/products/...)
   - Dostępność (wysoka, średnia, niska)

2. KOSZYK klienta (MCP get_cart):
   - Lista produktów w koszyku
   - Ilości i ceny
   - Total

3. FAQ/POLITYKI (Vectorize RAG):
   - Polityka zwrotów
   - Czas dostawy
   - Certyfikaty Fair Trade

ZASADY PRACY Z KONTEKSTEM RAG:
✓ Używaj WYŁĄCZNIE informacji z kontekstu — NIE halucynuj!
✓ Jeśli kontekst zawiera produkty → MUSISZ je wymienić w odpowiedzi
✓ Format produktu: "Nazwa (Cena) — [krótkie uzasadnienie + Fair Trade mention]"
✓ Linkuj produkty (Markdown): [Nazwa](URL)
✓ Jeśli brak produktów w kontekście, ale query produktowy → 
  "Nie znalazłem produktów spełniających kryteria [X]. Czy mogę pomóc w doprecyzowaniu?"

───────────────────────────────────────────────────────────────
JĘZYK I FORMATTING
───────────────────────────────────────────────────────────────

• JĘZYK: Zawsze po polsku (formy grzecznościowe: Pani/Pan)
• LINKI: Markdown format [Tekst](URL)
• CENY: Format polski z PLN (np. "4,500 PLN" nie "$4,500")
• LISTY: Bullet points (•) lub numerowane (1. 2. 3.)
• EMFAZA: **pogrubienie** dla kluczowych terminów (Fair Trade, platyna, etc.)
• CYTATY ŹRÓDEŁ: [doc_id] lub krótki fragment (gdy istotne fakty)

═══════════════════════════════════════════════════════════════
  KONIEC SYSTEM PROMPT — Rozpocznij konwersację
═══════════════════════════════════════════════════════════════
`;
```

---

### 2. INTENT CLASSIFICATION + ENTITY RESOLUTION (worker/src/services/intent.ts)

```typescript
/**
 * Intent Classification and Entity Resolution
 * LLM-based approach (Llama 3.3 Structured Output)
 * Zgodność z dokumentem sekcja IV.1
 */

import { getGroqResponse, type GroqMessage } from '../groq';

export interface IntentClassificationResult {
  intent: 'product_discovery' | 'transactional' | 'policy_inquiry' | 'conversational' | 'objection';
  confidence: 'high' | 'medium' | 'low';
  entities: {
    product_type?: string;          // np. "pierścionek zaręczynowy"
    metal?: string;                 // np. "białe złoto", "platyna"
    stones?: string;                // np. "szafir", "diament solitaire"
    style?: string;                 // np. "Art Deco", "minimalistyczny"
    budget?: string;                // np. "2000-5000 PLN"
    occasion?: string;              // np. "zaręczyny", "rocznica"
    other?: Record<string, string>; // dodatkowe encje
  };
  reasoning?: string; // wewnętrzna logika (dla debugowania)
}

interface HistoryEntry {
  role: 'user' | 'assistant';
  content: string;
  ts?: number;
}

/**
 * Klasyfikuje intencję użytkownika i wyodrębnia encje z zapytania
 * Wykorzystuje głęboką analizę historii (5-10 ostatnich wiadomości)
 */
export async function classifyIntentAndExtractEntities(
  message: string,
  history: HistoryEntry[],
  groqApiKey: string
): Promise<IntentClassificationResult> {
  // Przygotuj historię kontekstu (ostatnie 5 wymian = 10 wiadomości)
  const recentHistory = history.slice(-10);
  const historyContext = recentHistory
    .map((h, idx) => `[${idx + 1}] ${h.role.toUpperCase()}: ${h.content}`)
    .join('\n');

  const classificationPrompt = `Jesteś ekspertem od klasyfikacji intencji w luxury e-commerce (biżuteria Fair Trade).

HISTORIA KONWERSACJI (ostatnie 10 wiadomości):
${historyContext || '(brak historii)'}

NOWE ZAPYTANIE UŻYTKOWNIKA:
"${message}"

ZADANIE:
1. Sklasyfikuj intencję zapytania
2. Wyodrębnij WSZYSTKIE encje (z nowego zapytania + kontekstu historii)
3. Jeśli nowe zapytanie to follow-up ("z opalem?", "w złocie?") → 
   ZACHOWAJ encje z poprzednich wiadomości i AKTUALIZUJ tylko zmienione

INTENCJE:
• product_discovery — szuka produktów ("Macie pierścionki?", "Pokaż naszyjniki")
• transactional — koszyk, zamówienie ("Dodaj do koszyka", "Gdzie moja paczka?")
• policy_inquiry — FAQ, polityki ("Jaki czas dostawy?", "Jak zwrócić?")
• conversational — small talk ("Jak się masz?", "Co słychać?")
• objection — obiekcja cenowa/wartość ("Zbyt drogie", "Nie jestem pewien")

ZWRÓĆ JSON (bez dodatkowego tekstu, BEZ markdown code block):
{
  "intent": "product_discovery",
  "confidence": "high",
  "entities": {
    "product_type": "pierścionek zaręczynowy",
    "metal": "białe złoto",
    "stones": "szafir",
    "style": "Art Deco",
    "budget": "3000-5000 PLN",
    "occasion": "zaręczyny"
  },
  "reasoning": "Użytkownik pyta o konkretny produkt. W historii wzmiankował 'pierścionek', 
                teraz doprecyzowuje 'z opalem' → merge encji."
}`;

  const messages: GroqMessage[] = [
    {
      role: 'system',
      content: 'Jesteś ekspertem NLP w klasyfikacji intencji luxury e-commerce. Zwracasz TYLKO JSON, bez dodatkowego tekstu.',
    },
    {
      role: 'user',
      content: classificationPrompt,
    },
  ];

  try {
    const response = await getGroqResponse(messages, groqApiKey, 'llama-3.3-70b-versatile');
    
    // Clean response (remove markdown code blocks if present)
    let cleanedResponse = response.trim();
    if (cleanedResponse.startsWith('```json')) {
      cleanedResponse = cleanedResponse.replace(/```json\n?/, '').replace(/```\n?$/, '').trim();
    } else if (cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse.replace(/```\n?/, '').replace(/```\n?$/, '').trim();
    }
    
    const result: IntentClassificationResult = JSON.parse(cleanedResponse);
    
    // Validation
    if (!result.intent || !result.confidence) {
      throw new Error('Invalid intent classification result: missing intent or confidence');
    }
    
    return result;
  } catch (error) {
    console.error('[Intent Classification] Error:', error);
    
    // Fallback: basic regex classification (jako safety net)
    return fallbackIntentClassification(message);
  }
}

/**
 * Fallback intent classification using regex (safety net)
 */
function fallbackIntentClassification(message: string): IntentClassificationResult {
  const lowerMsg = message.toLowerCase();
  
  // Conversational
  if (/(jak się masz|co słychać|jak tam|co u ciebie|hej|cześć|witaj)/i.test(lowerMsg)) {
    return {
      intent: 'conversational',
      confidence: 'high',
      entities: {},
      reasoning: 'Fallback: detected greeting/small talk',
    };
  }
  
  // Transactional
  if (/(koszyk|dodaj|usuń|zamówienie|status|paczka|dostawa)/i.test(lowerMsg)) {
    return {
      intent: 'transactional',
      confidence: 'medium',
      entities: {},
      reasoning: 'Fallback: detected cart/order keywords',
    };
  }
  
  // Policy
  if (/(polityka|zwrot|reklamacja|gwarancja|certyfikat|czas dostawy)/i.test(lowerMsg)) {
    return {
      intent: 'policy_inquiry',
      confidence: 'medium',
      entities: {},
      reasoning: 'Fallback: detected policy keywords',
    };
  }
  
  // Objection
  if (/(drogi|drogie|za dużo|zbyt wiele|nie wiem|nie jestem pewien|wątpliwości)/i.test(lowerMsg)) {
    return {
      intent: 'objection',
      confidence: 'medium',
      entities: {},
      reasoning: 'Fallback: detected objection keywords',
    };
  }
  
  // Default: product_discovery
  return {
    intent: 'product_discovery',
    confidence: 'low',
    entities: {},
    reasoning: 'Fallback: default to product discovery (no clear pattern)',
  };
}
```

---

### 3. CUSTOMER CONTEXT MANAGEMENT (worker/src/services/customer-context.ts)

```typescript
/**
 * Customer Context Management
 * Zgodność z dokumentem sekcja IV.2 (Personalizacja)
 * 
 * Features:
 * - Extraction preferencji z historii konwersacji
 * - Storage w D1 (customer_profiles table)
 * - Injection do System Prompt jako narracja
 * - Context param dla MCP calls
 */

import type { D1Database } from '@cloudflare/workers-types';

export interface CustomerProfile {
  customer_id: string;
  email?: string;
  name?: string;
  preferences: {
    metals?: string[];          // ["platyna", "białe złoto"]
    stones?: string[];          // ["szafir", "diament"]
    styles?: string[];          // ["Art Deco", "minimalistyczny"]
    budget_range?: string;      // "3000-5000 PLN"
    occasions?: string[];       // ["zaręczyny", "rocznica"]
  };
  purchase_history: Array<{
    product_name: string;
    product_gid: string;
    date: string;
    price: string;
  }>;
  behavioral_narrative?: string; // generatywny opis (np. "Klientka Y kocha Art Deco...")
  lifetime_value?: number;
  last_updated: string;
}

/**
 * Pobiera profil klienta z D1
 */
export async function getCustomerProfile(
  customerId: string,
  db: D1Database
): Promise<CustomerProfile | null> {
  try {
    const result = await db
      .prepare('SELECT * FROM customer_profiles WHERE customer_id = ?')
      .bind(customerId)
      .first<{
        customer_id: string;
        email?: string;
        name?: string;
        preferences: string;
        purchase_history: string;
        behavioral_narrative?: string;
        lifetime_value?: number;
        last_updated: string;
      }>();

    if (!result) return null;

    return {
      customer_id: result.customer_id,
      email: result.email,
      name: result.name,
      preferences: JSON.parse(result.preferences || '{}'),
      purchase_history: JSON.parse(result.purchase_history || '[]'),
      behavioral_narrative: result.behavioral_narrative,
      lifetime_value: result.lifetime_value,
      last_updated: result.last_updated,
    };
  } catch (error) {
    console.error('[Customer Context] Error fetching profile:', error);
    return null;
  }
}

/**
 * Aktualizuje profil klienta (upsert)
 */
export async function updateCustomerProfile(
  profile: CustomerProfile,
  db: D1Database
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT OR REPLACE INTO customer_profiles 
        (customer_id, email, name, preferences, purchase_history, behavioral_narrative, lifetime_value, last_updated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        profile.customer_id,
        profile.email || null,
        profile.name || null,
        JSON.stringify(profile.preferences),
        JSON.stringify(profile.purchase_history),
        profile.behavioral_narrative || null,
        profile.lifetime_value || 0,
        profile.last_updated
      )
      .run();
  } catch (error) {
    console.error('[Customer Context] Error updating profile:', error);
    throw error;
  }
}

/**
 * Wyodrębnia preferencje z historii konwersacji (LLM-based)
 * Okresowe wywołanie (np. po każdych 5 wiadomościach)
 */
export async function extractPreferencesFromHistory(
  history: Array<{ role: string; content: string }>,
  groqApiKey: string
): Promise<CustomerProfile['preferences']> {
  const { getGroqResponse } = await import('../groq');
  
  const historyText = history
    .slice(-20) // ostatnie 20 wiadomości
    .map((h) => `${h.role.toUpperCase()}: ${h.content}`)
    .join('\n');

  const extractionPrompt = `Przeanalizuj poniższą historię konwersacji i wyodrębnij preferencje klienta.

HISTORIA:
${historyText}

Zwróć JSON (bez dodatkowego tekstu):
{
  "metals": ["platyna", "białe złoto"],
  "stones": ["szafir", "diament"],
  "styles": ["Art Deco", "minimalistyczny"],
  "budget_range": "3000-5000 PLN",
  "occasions": ["zaręczyny"]
}

Jeśli brak informacji o danej kategorii, pomiń pole.`;

  try {
    const response = await getGroqResponse(
      [
        {
          role: 'system',
          content: 'Jesteś ekspertem od analizy preferencji klientów luxury e-commerce. Zwracasz TYLKO JSON.',
        },
        { role: 'user', content: extractionPrompt },
      ],
      groqApiKey,
      'llama-3.3-70b-versatile'
    );

    let cleanedResponse = response.trim();
    if (cleanedResponse.startsWith('```json')) {
      cleanedResponse = cleanedResponse.replace(/```json\n?/, '').replace(/```\n?$/, '').trim();
    }

    return JSON.parse(cleanedResponse);
  } catch (error) {
    console.error('[Customer Context] Error extracting preferences:', error);
    return {};
  }
}

/**
 * Generuje behavioral narrative (narracyjny opis klienta dla LLM)
 */
export async function generateBehavioralNarrative(
  profile: CustomerProfile,
  groqApiKey: string
): Promise<string> {
  const { getGroqResponse } = await import('../groq');

  const narrativePrompt = `Stwórz zwięzły, narracyjny opis klienta dla luxury asystenta AI.

DANE KLIENTA:
- Preferowane metale: ${profile.preferences.metals?.join(', ') || 'brak danych'}
- Preferowane kamienie: ${profile.preferences.stones?.join(', ') || 'brak danych'}
- Style: ${profile.preferences.styles?.join(', ') || 'brak danych'}
- Budżet: ${profile.preferences.budget_range || 'brak danych'}
- Historia zakupów: ${profile.purchase_history.length} produktów
- Lifetime Value: ${profile.lifetime_value} PLN

Napisz 2-3 zdania w stylu:
"Klientka Y jest koneserką dużych pierścionków z szafirem w stylu Art Deco. 
Preferuje platynę i budżet premium 5000+ PLN. Reaguje na limitowane kolekcje 
i ma tendencję do zakupów impulsywnych."

Zwróć TYLKO narrację (bez dodatkowych komentarzy):`;

  try {
    const response = await getGroqResponse(
      [
        {
          role: 'system',
          content: 'Jesteś ekspertem od personalizacji w luxury e-commerce.',
        },
        { role: 'user', content: narrativePrompt },
      ],
      groqApiKey,
      'llama-3.3-70b-versatile'
    );

    return response.trim();
  } catch (error) {
    console.error('[Customer Context] Error generating narrative:', error);
    return `Klient ${profile.customer_id} (profil w budowie)`;
  }
}

/**
 * Buduje kontekst klienta do wstrzyknięcia w System Prompt
 */
export function buildCustomerContextForPrompt(profile: CustomerProfile | null): string {
  if (!profile) return '';

  const sections: string[] = [];

  sections.push('═══════════════════════════════════════════════════════════════');
  sections.push('PROFIL KLIENTA (Kontekst Personalizacji)');
  sections.push('═══════════════════════════════════════════════════════════════');

  if (profile.name) {
    sections.push(`IMIĘ: ${profile.name}`);
  }

  if (profile.behavioral_narrative) {
    sections.push(`\nNARRATYWA: ${profile.behavioral_narrative}`);
  }

  if (profile.preferences && Object.keys(profile.preferences).length > 0) {
    sections.push('\nPREFERENCJE:');
    if (profile.preferences.metals?.length) {
      sections.push(`• Metale: ${profile.preferences.metals.join(', ')}`);
    }
    if (profile.preferences.stones?.length) {
      sections.push(`• Kamienie: ${profile.preferences.stones.join(', ')}`);
    }
    if (profile.preferences.styles?.length) {
      sections.push(`• Style: ${profile.preferences.styles.join(', ')}`);
    }
    if (profile.preferences.budget_range) {
      sections.push(`• Budżet: ${profile.preferences.budget_range}`);
    }
  }

  if (profile.purchase_history && profile.purchase_history.length > 0) {
    sections.push('\nHISTORIA ZAKUPÓW (ostatnie 3):');
    profile.purchase_history.slice(0, 3).forEach((purchase) => {
      sections.push(`• ${purchase.product_name} (${purchase.price}) — ${purchase.date}`);
    });
  }

  if (profile.lifetime_value) {
    sections.push(`\nLIFETIME VALUE: ${profile.lifetime_value} PLN (Klient Premium)`);
  }

  sections.push('\nINSTRUKCJA: Wykorzystaj powyższy kontekst do personalizacji rekomendacji.');
  sections.push('Odwołuj się do wcześniejszych zakupów i preferencji w sposób naturalny.');
  sections.push('═══════════════════════════════════════════════════════════════\n');

  return sections.join('\n');
}

/**
 * Buduje context param dla MCP calls (short version)
 */
export function buildMcpContextParam(profile: CustomerProfile | null, currentQuery: string): string {
  if (!profile) return currentQuery;

  const contextParts: string[] = [];

  if (profile.behavioral_narrative) {
    contextParts.push(profile.behavioral_narrative);
  }

  if (profile.preferences) {
    const prefs: string[] = [];
    if (profile.preferences.metals?.length) prefs.push(`preferuje ${profile.preferences.metals.join(' lub ')}`);
    if (profile.preferences.stones?.length) prefs.push(`lubi ${profile.preferences.stones.join(', ')}`);
    if (profile.preferences.styles?.length) prefs.push(`styl ${profile.preferences.styles.join(', ')}`);
    if (profile.preferences.budget_range) prefs.push(`budżet ${profile.preferences.budget_range}`);
    
    if (prefs.length > 0) {
      contextParts.push(`Preferencje: ${prefs.join(', ')}`);
    }
  }

  if (profile.purchase_history && profile.purchase_history.length > 0) {
    const lastPurchase = profile.purchase_history[0];
    contextParts.push(`Ostatni zakup: ${lastPurchase.product_name}`);
  }

  contextParts.push(`Aktualne zapytanie: ${currentQuery}`);

  return contextParts.join('. ');
}
```

---

### 4. CONDITIONAL CHAIN-OF-THOUGHT (worker/src/services/cot.ts)

```typescript
/**
 * Conditional Chain-of-Thought (CoT) Logic
 * Zgodność z dokumentem sekcja V.1
 * 
 * Automatyczne reasoning dla:
 * - Obiekcji cenowych/wartości
 * - Złożonych rekomendacji produktowych (multi-criteria)
 * - Porównań produktów
 */

import type { IntentClassificationResult } from './intent';

export interface CoTStrategy {
  enabled: boolean;
  instructions: string;
  temperature?: number; // optional: różna temperature dla różnych strategii
}

/**
 * Decyduje czy i jaką strategię CoT zastosować dla danej intencji
 */
export function selectCoTStrategy(
  intent: IntentClassificationResult,
  message: string
): CoTStrategy {
  const lowerMsg = message.toLowerCase();

  // CASE 1: Obiekcja (ZAWSZE CoT)
  if (intent.intent === 'objection') {
    return {
      enabled: true,
      temperature: 0.6, // niższa dla spójności argumentacji
      instructions: `
INSTRUKCJA REASONING (KROK PO KROKU):
Pomyśl wewnętrznie (nie pokazuj użytkownikowi):

KROK 1: IDENTYFIKACJA OBIEKCJI
- Jakiego typu obiekcja? (cena? dostępność? zaufanie? gwarancja?)
- Czy klient jest blisko zakupu, czy w fazie eksploracji?

KROK 2: RAG SEARCH (wykorzystaj kontekst poniżej)
- Znajdź uzasadnienie wartości (Fair Trade, rzemiosło, certyfikaty)
- Znajdź dane wspierające (długowieczność, gwarancja, transparentność)

KROK 3: SYNTEZA ODPOWIEDZI (3 elementy)
a) WALIDACJA OBAW — "Rozumiem Pani/Pana refleksję..." (empatia)
b) UZASADNIENIE WARTOŚCI — Fair Trade jako USP, długoterminowa inwestycja
c) CALL TO ACTION — pytanie zamykające (np. "Czy chciałaby Pani poznać szczegóły?")

Teraz sformułuj odpowiedź dla użytkownika (BEZ pokazywania powyższych kroków):`,
    };
  }

  // CASE 2: Złożone zapytanie produktowe (multi-criteria)
  const hasMultipleCriteria =
    (intent.entities.metal && intent.entities.stones) ||
    (intent.entities.style && intent.entities.budget) ||
    /porówna|różnica|lepszy|lepsze|jaki wybrać|który|która/.test(lowerMsg);

  if (intent.intent === 'product_discovery' && hasMultipleCriteria) {
    return {
      enabled: true,
      temperature: 0.7, // standard dla rekomendacji
      instructions: `
INSTRUKCJA REASONING (KROK PO KROKU):
Pomyśl wewnętrznie (nie pokazuj użytkownikowi):

KROK 1: ANALIZA KRYTERIÓW
- Jakie kryteria podał użytkownik? (metal, kamienie, styl, budżet, okazja)
- Które kryteria są najważniejsze? (priorytetyzuj)

KROK 2: DOPASOWANIE PRODUKTÓW (z kontekstu RAG)
- Znajdź produkty spełniające kryteria (min. 2 z 3 kryteriów)
- Oceń dopasowanie (perfect match vs good match vs compromise)

KROK 3: SYNTEZA REKOMENDACJI
- Zacznij od najlepszego dopasowania
- Krótko uzasadnij (dlaczego pasuje do preferencji)
- Wzmianka Fair Trade (OBOWIĄZKOWA)
- Max 3 produkty

Teraz sformułuj odpowiedź dla użytkownika (BEZ pokazywania powyższych kroków):`,
    };
  }

  // CASE 3: Porównanie produktów (ZAWSZE CoT)
  if (/porówna|różnica|versus|vs|czy lepiej|jaki wybrać/.test(lowerMsg)) {
    return {
      enabled: true,
      temperature: 0.7,
      instructions: `
INSTRUKCJA REASONING (KROK PO KROKU):
Pomyśl wewnętrznie (nie pokazuj użytkownikowi):

KROK 1: IDENTYFIKACJA PRODUKTÓW DO PORÓWNANIA
- Jakie produkty użytkownik chce porównać?
- Czy są w kontekście RAG?

KROK 2: ANALIZA RÓŻNIC
- Materiał (platyna vs białe złoto)
- Kamienie (rozmiar, pochodzenie, jakość)
- Styl (klasyczny vs nowoczesny)
- Cena (wartość vs budżet)

KROK 3: SYNTEZA PORÓWNANIA
- Tabela lub bullet points (jasne różnice)
- Rekomendacja (który lepiej pasuje do preferencji klienta)
- Fair Trade mention dla obu

Teraz sformułuj odpowiedź dla użytkownika (BEZ pokazywania powyższych kroków):`,
    };
  }

  // CASE 4: Brak CoT (proste zapytania)
  return {
    enabled: false,
    instructions: '',
  };
}
```

---

## 📐 D1 DATABASE SCHEMA

```sql
-- Tabela customer_profiles
CREATE TABLE IF NOT EXISTS customer_profiles (
  customer_id TEXT PRIMARY KEY,
  email TEXT,
  name TEXT,
  preferences TEXT NOT NULL DEFAULT '{}',        -- JSON
  purchase_history TEXT NOT NULL DEFAULT '[]',  -- JSON array
  behavioral_narrative TEXT,
  lifetime_value REAL DEFAULT 0,
  last_updated TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_customer_email ON customer_profiles(email);
CREATE INDEX idx_customer_ltv ON customer_profiles(lifetime_value DESC);
```

---

## 🔄 REFACTOR INDEX.TS (Orchestration Logic)

Główne zmiany w `worker/src/index.ts`:

1. **Import nowych modułów:**
```typescript
import { classifyIntentAndExtractEntities } from './services/intent';
import { 
  getCustomerProfile, 
  buildCustomerContextForPrompt, 
  buildMcpContextParam 
} from './services/customer-context';
import { selectCoTStrategy } from './services/cot';
import { LUXURY_SYSTEM_PROMPT_V2 } from './prompts/luxury-system-prompt';
```

2. **Nowa funkcja handleChat() z pełną orchestracją:**
   - Pobierz customer_id z request headers (Shopify App Proxy)
   - Załaduj customer profile z D1
   - Wywołaj classifyIntentAndExtractEntities()
   - Decyzja o MCP call (przez model lub bezpośrednio)
   - Wybór CoT strategy
   - Wstrzyknięcie customer context + CoT instructions do promptu
   - Wywołanie Groq
   - Zapis odpowiedzi do SessionDO

---

## 📊 METRYKI I MONITORING

Zgodnie z dokumentem sekcja VII.2:

1. **Intent Accuracy:**
   - Log: `[Intent] classification=${intent} confidence=${confidence} correct=${boolean}`
   - Target: >90%

2. **MCP False Positives:**
   - Log: `[MCP] called=${boolean} intent=${intent} necessary=${boolean}`
   - Target: <5%

3. **Fair Trade Mentions:**
   - Log: `[Ethics] product_recommendation=${boolean} fair_trade_mentioned=${boolean}`
   - Target: 100% dla product recommendations

4. **Response Latency:**
   - Log: `[Performance] total_time=${ms} intent_time=${ms} mcp_time=${ms} llm_time=${ms}`
   - Target: p95 <500ms

---

## 🚀 DEPLOYMENT PLAN

### FAZA 1: Foundation (Tydzień 1)
- [ ] Stwórz `worker/src/prompts/luxury-system-prompt.ts` z LUXURY_SYSTEM_PROMPT_V2
- [ ] Stwórz `worker/src/services/intent.ts` (Intent Classification)
- [ ] Testy jednostkowe intent.ts (Vitest)
- [ ] Deploy do dev environment
- [ ] Manualne testy (10 scenariuszy z dokumentu)

### FAZA 2: Personalizacja (Tydzień 2)
- [ ] D1 migration: customer_profiles table
- [ ] Stwórz `worker/src/services/customer-context.ts`
- [ ] Integracja customer_id z Shopify App Proxy headers
- [ ] Testy jednostkowe customer-context.ts
- [ ] Deploy do dev + staging
- [ ] A/B testing (50% traffic z personalizacją)

### FAZA 3: Advanced Reasoning (Tydzień 3)
- [ ] Stwórz `worker/src/services/cot.ts` (Conditional CoT)
- [ ] Refactor index.ts (pełna orchestracja)
- [ ] Testy integracyjne (end-to-end)
- [ ] Deploy do staging
- [ ] Produkcyjny pilot (10% traffic)

### FAZA 4: Production Rollout (Tydzień 4)
- [ ] Monitoring dashboard (metryki z sekcji powyżej)
- [ ] Stopniowy rollout: 25% → 50% → 75% → 100%
- [ ] Zbieranie feedbacku (thumbs up/down w frontend)
- [ ] Dokumentacja finalna

---

## ✅ SUCCESS CRITERIA

Po pełnym wdrożeniu (4 tygodnie):

- [ ] **Intent Accuracy ≥95%** (LLM-based vs regex baseline ~70%)
- [ ] **Fair Trade mentions = 100%** dla product recommendations
- [ ] **MCP False Positives <5%** (vs baseline ~20%)
- [ ] **Customer satisfaction (tone) +25%** (user surveys)
- [ ] **Conversion rate (obiekcje) +40%** (vs baseline bez CoT)
- [ ] **Latencja p95 <500ms** (Groq ultra-fast maintained)
- [ ] **Zero breaking changes** (backward compatible)

---

## 📚 REFERENCES

- Dokument: "Ekspercka Architektura Prompt Engineering dla Luksusowego AI Asystenta E-commerce"
- Llama 3.3 Documentation: https://www.llama.com/docs/model-cards-and-prompt-formats/llama3_3
- Shopify MCP API: https://shopify.dev/docs/api/mcp
- Groq LPU Performance: https://groq.com/benchmarks

---

**KONIEC PLANU REFACTORINGU**

Gotowy do implementacji? Wybierz fazę, od której zaczynamy.
