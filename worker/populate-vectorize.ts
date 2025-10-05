/**
 * Helper script to populate Vectorize index with shop policies and FAQs
 * 
 * This is a template - you need to run this as a Worker or in Wrangler dev mode
 * 
 * Usage:
 *   1. Copy this content into a new worker file or use in wrangler dev
 *   2. Update the documents array with your actual shop policies and FAQs
 *   3. Run: npx wrangler dev populate-vectorize.ts
 *   4. Make a request to trigger the population
 */

interface Env {
  AI: any;
  VECTORIZE: VectorizeIndex;
}

const documents = [
  {
    id: 'shipping-1',
    text: 'Oferujemy darmową wysyłkę dla zamówień powyżej 500 zł. Standardowa wysyłka trwa 3-5 dni roboczych. Ekspresowa dostawa dostępna za dodatkową opłatą 20 zł (dostawa następnego dnia roboczego).',
    metadata: { type: 'policy', category: 'shipping', lang: 'pl' }
  },
  {
    id: 'materials-1',
    text: 'Wszystkie nasze produkty wykonane są z certyfikowanego srebra próby 925. Używamy również 14-karatowego złota oraz naturalnych kamieni szlachetnych. Każdy produkt posiada certyfikat autentyczności.',
    metadata: { type: 'faq', category: 'materials', lang: 'pl' }
  },
  {
    id: 'returns-1',
    text: 'Akceptujemy zwroty w ciągu 30 dni od daty zakupu. Produkt musi być w oryginalnym stanie, nieużywany, z wszystkimi metkami. Zwrot kosztów następuje w ciągu 14 dni roboczych od otrzymania zwróconego towaru.',
    metadata: { type: 'policy', category: 'returns', lang: 'pl' }
  },
  {
    id: 'sizing-1',
    text: 'Oferujemy dopasowanie rozmiaru pierścionków za darmo w naszym salonie. Większość naszych produktów dostępna jest w rozmiarach od 10 do 23. Szczegółową tabelę rozmiarów znajdziesz na każdej stronie produktu.',
    metadata: { type: 'faq', category: 'sizing', lang: 'pl' }
  },
  {
    id: 'care-1',
    text: 'Aby zachować piękno Twojej biżuterii: unikaj kontaktu z wodą i chemikaliami, przechowuj w suchym miejscu w oddzielnych workach, czyść miękką szmatką. Polecamy profesjonalne czyszczenie co 6-12 miesięcy.',
    metadata: { type: 'faq', category: 'care', lang: 'pl' }
  },
  {
    id: 'warranty-1',
    text: 'Wszystkie nasze produkty objęte są 2-letnią gwarancją na wady produkcyjne. Gwarancja nie obejmuje normalnego zużycia, uszkodzeń mechanicznych ani nieprawidłowego użytkowania. Oferujemy również bezpłatne naprawy w okresie gwarancyjnym.',
    metadata: { type: 'policy', category: 'warranty', lang: 'pl' }
  },
  {
    id: 'customization-1',
    text: 'Oferujemy personalizację biżuterii poprzez grawerowanie imion, dat lub krótkich wiadomości. Usługa grawerowania kosztuje 50 zł za produkt. Czas realizacji: 3-7 dni roboczych. Spersonalizowane produkty nie podlegają zwrotowi.',
    metadata: { type: 'faq', category: 'customization', lang: 'pl' }
  },
  {
    id: 'payment-1',
    text: 'Akceptujemy płatności kartą kredytową (Visa, Mastercard, American Express), PayPal, BLIK oraz przelewy bankowe. Oferujemy również raty 0% na zakupy powyżej 1000 zł przez naszego partnera finansowego.',
    metadata: { type: 'policy', category: 'payment', lang: 'pl' }
  },
  {
    id: 'about-epir-1',
    text: 'EPIR to polska manufaktura biżuterii artystycznej działająca od 1995 roku. Specjalizujemy się w ręcznie wykonanej biżuterii ze srebra i złota. Każdy element tworzymy z pasją i dbałością o najdrobniejsze szczegóły.',
    metadata: { type: 'about', category: 'company', lang: 'pl' }
  },
  {
    id: 'collections-1',
    text: 'Nasze kolekcje obejmują: pierścionki (w tym zaręczynowe), naszyjniki, kolczyki, bransoletki i broszki. Oferujemy zarówno klasyczne wzory, jak i nowoczesne, awangardowe projekty. Regularnie wprowadzamy nowe kolekcje sezonowe.',
    metadata: { type: 'faq', category: 'products', lang: 'pl' }
  }
];

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      console.log('Starting Vectorize population...');
      
      let successCount = 0;
      let errorCount = 0;
      
      for (const doc of documents) {
        try {
          console.log(`Processing document: ${doc.id}`);
          
          // Generate embedding using Workers AI
          const embeddingResponse = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
            text: doc.text
          });
          
          if (!embeddingResponse?.data?.[0]) {
            console.error(`Failed to generate embedding for ${doc.id}`);
            errorCount++;
            continue;
          }
          
          const embedding = embeddingResponse.data[0];
          
          // Insert into Vectorize
          await env.VECTORIZE.insert([{
            id: doc.id,
            values: embedding,
            metadata: {
              ...doc.metadata,
              text: doc.text
            }
          }]);
          
          console.log(`✅ Inserted ${doc.id}`);
          successCount++;
          
        } catch (error: any) {
          console.error(`❌ Error processing ${doc.id}:`, error.message);
          errorCount++;
        }
      }
      
      const summary = {
        total: documents.length,
        success: successCount,
        errors: errorCount,
        message: 'Vectorize population completed'
      };
      
      console.log('Summary:', summary);
      
      return new Response(JSON.stringify(summary, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });
      
    } catch (error: any) {
      console.error('Population error:', error);
      return new Response(JSON.stringify({
        error: error.message,
        stack: error.stack
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};
