# Copilot Instructions for Asystent EPIR

## Overview
Asystent EPIR is a multi-agent system designed for managing e-commerce operations, specifically for EPIR Art Jewellery. The system integrates with Shopify, Google Analytics, and Google Ads, leveraging Firebase and AI technologies like Genkit and Vertex AI.

## Architecture
- **Backend**: Firebase Functions (Node.js) with integrations for Shopify, Google Analytics, and Google Ads.
- **Frontend**: Next.js (TypeScript) for dashboards and user interfaces.
- **Database**: Firestore for structured data and Cloud Storage for assets.
- **AI**: Genkit and Vertex AI for analytics, recommendations, and campaign management.
- **Agents**: Modular AI agents for analytics, campaign optimization, and customer support.

## Key Files and Directories
- `functions/src/agents/analyticsAgent.ts`: Core logic for analytics, integrates with Vertex AI.
- `functions/src/integrations/shopifyClient.ts`: Handles Shopify API interactions.
- `functions/src/index.ts`: Entry point for Firebase Functions, exports callable agents.
- `README.md`: Comprehensive project overview and setup instructions.
- `.env`: Stores API keys and sensitive configurations (not committed).

## Developer Workflows
### Local Development
1. Start Firebase emulators:
   ```bash
   firebase emulators:start
   ```
2. Run the Next.js frontend:
   ```bash
   cd frontend && npm run dev
   ```
3. Test callable functions locally using PowerShell scripts like `test_function.ps1`.

### Deployment
Deploy both backend and frontend:
```bash
firebase deploy --only functions,hosting
```

### Testing
- Unit tests are located in `functions/src/agents/__tests__/` and `functions/src/integrations/__tests__/`.
- Use Jest for backend tests:
  ```bash
  npm run test
  ```

## Patterns and Conventions
- **Error Handling**: Use custom error classes like `AnalyticsAgentError` for structured error reporting.
- **AI Integration**: Define flows using Genkit (e.g., `analyticsAgentFlow`) and export them as callable Firebase Functions.
- **Environment Variables**: All API keys (e.g., Shopify, Google Ads) are stored in `.env` and accessed via `process.env`.
- **Data Storage**: Use Firestore for structured data and `/data/` for static files like embeddings.

## Integration Points
- **Shopify**: Configured via `SHOPIFY_STORE_URL`, `SHOPIFY_ACCESS_TOKEN`, and `SHOPIFY_API_VERSION` in `.env`.
- **Google Analytics**: Firebase Analytics is integrated; advanced queries may require Google Analytics Data API.
- **Google Ads**: Managed via `GOOGLE_ADS_CUSTOMER_ID` and `GOOGLE_ADS_DEVELOPER_TOKEN`.

## Examples
### Adding a New Agent
1. Define a new flow in `functions/src/agents/`:
   ```typescript
   const newAgentFlow = ai.defineFlow({
     name: "newAgentFlow",
     inputSchema: z.string(),
     outputSchema: z.string(),
   }, async (input) => {
     return `Processed: ${input}`;
   });
   ```
2. Export it in `functions/src/index.ts`:
   ```typescript
   export const callNewAgent = onCallGenkit({}, newAgentFlow);
   ```

### Accessing Shopify Data
Use `shopifyClient.ts` to fetch product data:
```typescript
const products = await shopifyClient.getProducts();
```

## Notes
- Always test locally before deploying to Firebase.
- Follow the coding conventions outlined in `README.md`.
- For advanced AI features, consult `docs/AGENTS.md` and `docs/ARCHITECTURE.md`.
