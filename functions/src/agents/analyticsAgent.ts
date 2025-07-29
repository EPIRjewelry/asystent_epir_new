/**
 * @fileoverview Analytics Agent for EPIR Jewelry E-commerce Platform
 *
 * This module implements an AI-powered analytics agent that provides insights
 * and analysis for e-commerce operations, specifically tailored for EPIR
 * jewelry business. The agent integrates with Google's Vertex AI to process
 * natural language queries and generate actionable analytics responses.
 *
 * Key Features:
 * - Natural language processing for analytics queries
 * - E-commerce specific insights and recommendations
 * - Integration with Vertex AI Gemini models
 * - Robust error handling and retry mechanisms
 * - Firebase Cloud Functions integration
 *
 * @author EPIR Development Team
 * @version 1.0.0
 */

import {genkit, z} from "genkit";
import {googleAI, gemini15Flash} from "@genkit-ai/googleai";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { google } from 'googleapis';
import shopifyClient from '../integrations/shopifyClient';

/**
 * Configuration interface for retry mechanisms
 */
interface RetryConfig {
  /** Maximum number of retry attempts */
  maxAttempts: number;
  /** Initial delay in milliseconds */
  initialDelay: number;
  /** Multiplier for exponential backoff */
  backoffMultiplier: number;
  /** Maximum delay between retries in milliseconds */
  maxDelay: number;
}

/**
 * Custom error class for analytics agent operations
 */
class AnalyticsAgentError extends Error {
  /**
   * Creates a new AnalyticsAgentError
   * @param {string} message - Error message
   * @param {string} code - Error code
   * @param {Error} originalError - Original error that caused this error
   */
  constructor(
    message: string,
    public readonly code: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = "AnalyticsAgentError";
  }
}

/**
 * Default retry configuration for AI operations
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelay: 1000,
  backoffMultiplier: 2,
  maxDelay: 10000,
};

/**
 * Utility function to implement exponential backoff delay
 *
 * @param {number} attempt - Current attempt number (starting from 0)
 * @param {RetryConfig} config - Retry configuration object
 * @return {Promise<void>} Promise that resolves after the calculated delay
 */
const exponentialBackoffDelay = async (
  attempt: number,
  config: RetryConfig
): Promise<void> => {
  const delay = Math.min(
    config.initialDelay * Math.pow(config.backoffMultiplier, attempt),
    config.maxDelay
  );
  return new Promise((resolve) => setTimeout(resolve, delay));
};

/**
 * Validates and sanitizes user input for analytics queries
 *
 * @param {string} input - Raw user input string
 * @return {string} Sanitized and validated input string
 * @throws {AnalyticsAgentError} When input is invalid or contains harmful content
 */
const validateInput = (input: string): string => {
  if (!input || typeof input !== "string") {
    throw new AnalyticsAgentError(
      "Invalid input: Input must be a non-empty string",
      "INVALID_INPUT"
    );
  }

  // Remove potentially harmful content and trim whitespace
  const sanitized = input.trim().replace(/[<>]/g, "");

  if (sanitized.length === 0) {
    throw new AnalyticsAgentError(
      "Invalid input: Input cannot be empty after sanitization",
      "EMPTY_INPUT"
    );
  }

  if (sanitized.length > 1000) {
    throw new AnalyticsAgentError(
      "Invalid input: Input exceeds maximum length of 1000 characters",
      "INPUT_TOO_LONG"
    );
  }

  return sanitized;
};

/**
 * Creates and configures the Genkit AI instance with Google AI plugin
 *
 * This function initializes the AI system with proper error handling
 * and configuration for the analytics agent operations.
 *
 * @return Configured Genkit AI instance
 * @throws {AnalyticsAgentError} When AI initialization fails
 */
const createAIInstance = () => {
  try {
    return genkit({
      plugins: [
        googleAI({
          apiKey: process.env.GEMINI_API_KEY,
        }),
      ],
    });
  } catch (error) {
    throw new AnalyticsAgentError(
      "Failed to initialize AI instance",
      "AI_INIT_FAILED",
      error instanceof Error ? error : new Error(String(error))
    );
  }
};

// Initialize AI instance with error handling
const ai = createAIInstance();

/**
 * Generates AI response with retry mechanism and comprehensive error handling
 *
 * This function implements exponential backoff retry logic to handle
 * temporary failures, network issues, and API rate limiting.
 *
 * @param input - Validated user input for analytics query
 * @param retryConfig - Configuration for retry behavior
 * @return Promise resolving to AI-generated response text
 * @throws {AnalyticsAgentError} When all retry attempts fail
 */
const generateWithRetry = async (
  input: string,
  retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<string> => {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < retryConfig.maxAttempts; attempt++) {
    try {
      const response = await ai.generate({
        model: gemini15Flash,
        prompt: `Jesteś ekspertem od analizy e-commerce dla EPIR biżuterii. 
                 Analizuj dane i udzielaj praktycznych porad biznesowych.
                 Odpowiadaj w języku polskim, korzystając z wiedzy o branży jubilerskiej.
                 
                 Zapytanie użytkownika: ${input}
                 
                 Podaj szczegółową analizę i konkretne rekomendacje.`,
        config: {
          temperature: 0.7,
          maxOutputTokens: 1000,
        },
      });

      if (!response || !response.text) {
        throw new Error("Empty response from AI model");
      }

      return response.text;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Log the attempt for debugging
      console.warn(
        `Analytics AI generation attempt ${attempt + 1} failed:`,
        lastError.message
      );

      // Don't retry on the last attempt
      if (attempt === retryConfig.maxAttempts - 1) {
        break;
      }

      // Apply exponential backoff delay before retry
      await exponentialBackoffDelay(attempt, retryConfig);
    }
  }

  throw new AnalyticsAgentError(
    `Failed to generate AI response after ${retryConfig.maxAttempts} attempts`,
    "AI_GENERATION_FAILED",
    lastError || undefined
  );
};

/**
 * Fetches metrics from Google Analytics Data API.
 * @returns {Promise<any>} - Analytics data.
 */
async function getFirebaseMetrics(): Promise<any> {
  const analytics = google.analyticsdata('v1beta');
  try {
    const response = await analytics.properties.runReport({
      property: 'properties/YOUR_PROPERTY_ID',
      requestBody: {
        dimensions: [{ name: 'city' }],
        metrics: [{ name: 'activeUsers' }],
        dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
      },
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching Google Analytics data:', error);
    throw new AnalyticsAgentError('Failed to fetch Google Analytics data', 'GA_API_ERROR', error);
  }
}

/**
 * Fetches sales data from Shopify.
 * @returns {Promise<any>} - Shopify sales data.
 */
async function getShopifyMetrics(): Promise<any> {
  try {
    const products = await shopifyClient.getProducts();
    return products;
  } catch (error) {
    console.error('Error fetching Shopify data:', error);
    throw new AnalyticsAgentError('Failed to fetch Shopify data', 'SHOPIFY_API_ERROR', error);
  }
}

/**
 * Analytics Agent Flow Definition
 *
 * This is the main entry point for the analytics agent. It defines a Genkit flow
 * that processes e-commerce analytics queries and returns AI-generated insights
 * specifically tailored for EPIR jewelry business operations.
 *
 * The flow includes:
 * - Input validation and sanitization
 * - Robust error handling with custom error types
 * - Retry mechanisms with exponential backoff
 * - Structured logging for monitoring and debugging
 *
 * @example
 * ```typescript
 * // Example usage in a Cloud Function
 * const result = await analyticsAgentFlow("Jak zwiększyć sprzedaż biżuterii?");
 * console.log(result); // AI-generated business insights
 * ```
 *
 * @param input - Natural language query about e-commerce analytics
 * @returns Promise resolving to AI-generated analytics insights
 * @throws {AnalyticsAgentError} When input validation or AI generation fails
 */
export const analyticsAgentFlow = ai.defineFlow(
  {
    name: 'analyticsAgentFlow',
    inputSchema: z.object({
      input: z.string().describe('Query for analytics insights'),
    }),
    outputSchema: z.string().describe('Generated analytics insights'),
  },
  async (data: { input: string }): Promise<string> => {
    try {
      const firebaseMetrics = await getFirebaseMetrics();
      const shopifyMetrics = await getShopifyMetrics();

      // Combine and analyze data
      const insights = `Firebase Metrics: ${JSON.stringify(firebaseMetrics)}, Shopify Metrics: ${JSON.stringify(shopifyMetrics)}`;
      return insights;
    } catch (error) {
      console.error('Error in analyticsAgentFlow:', error);
      throw new AnalyticsAgentError('Failed to process analytics query', 'ANALYTICS_FLOW_ERROR', error);
    }
  }
);

/**
 * Processes analytics queries with real-world data from Firestore.
 * @param {string} userId - The ID of the authenticated user.
 * @param {string} query - The analytics query.
 * @returns {Promise<any>} - The analytics result.
 */
export async function processAnalyticsQuery(userId: string, query: string): Promise<any> {
  try {
    // Verify user authentication
    const user = await auth.getUser(userId);
    if (!user) {
      throw new AnalyticsAgentError("User not authenticated", "AUTH_ERROR");
    }

    // Fetch user-specific data from Firestore
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) {
      throw new AnalyticsAgentError("User data not found", "DATA_ERROR");
    }

    const userData = userDoc.data();

    // Process the query with Google AI
    const aiResponse = await googleAI(gemini15Flash, {
      prompt: query,
      context: userData,
    });

    return aiResponse;
  } catch (error) {
    console.error("Error processing analytics query:", error);
    throw new AnalyticsAgentError("Failed to process query", "PROCESSING_ERROR", error);
  }
}
