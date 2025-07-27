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
import {vertexAI, gemini15Flash} from "@genkit-ai/vertexai";

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
 * @param attempt - Current attempt number (starting from 0)
 * @param config - Retry configuration object
 * @return Promise that resolves after the calculated delay
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
 * @param input - Raw user input string
 * @return Sanitized and validated input string
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
 * Creates and configures the Genkit AI instance with Vertex AI plugin
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
        vertexAI({
          location: "us-central1",
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
    name: "analyticsAgentFlow",
    inputSchema: z.string().describe(
      "Pytanie lub zapytanie dotyczące analityki e-commerce dla branży jubilerskiej"
    ),
    outputSchema: z.string().describe(
      "Szczegółowa analiza i rekomendacje biznesowe wygenerowane przez AI"
    ),
  },
  async (input: string): Promise<string> => {
    try {
      // Log incoming request for monitoring
      console.log("Analytics agent processing query:", {
        inputLength: input.length,
        timestamp: new Date().toISOString(),
      });

      // Validate and sanitize input
      const validatedInput = validateInput(input);

      // Generate response with retry mechanism
      const response = await generateWithRetry(validatedInput);

      // Log successful completion
      console.log("Analytics agent query completed successfully:", {
        responseLength: response.length,
        timestamp: new Date().toISOString(),
      });

      return response;
    } catch (error) {
      // Log error for monitoring and debugging
      console.error("Analytics agent error:", {
        error: error instanceof Error ? error.message : String(error),
        code: error instanceof AnalyticsAgentError ? error.code : "UNKNOWN",
        timestamp: new Date().toISOString(),
      });

      // Re-throw as AnalyticsAgentError if not already
      if (error instanceof AnalyticsAgentError) {
        throw error;
      }

      throw new AnalyticsAgentError(
        "Unexpected error in analytics agent",
        "UNEXPECTED_ERROR",
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }
);
