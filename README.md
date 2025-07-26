# EPIR Multi-Agent E-commerce Analytics Application

## Overview

This project aims to create a comprehensive multi-agent e-commerce analytics application for **EPIR Art Jewellery**, a Polish artisan jewelry studio. The application is designed to provide real-time analytics, automate campaign management, and enable intelligent customer engagement through the integration of Firebase services, the Genkit framework, and a modern Next.js frontend.

## Architecture

The application is built on a robust, scalable architecture leveraging Google's Firebase ecosystem and modern web development practices:

### 1. Frontend: Next.js 14 with App Router & TypeScript
- A responsive and dynamic user interface built with Next.js, providing real-time dashboards, an AI chat interface, and administrative panels.
- Hosted and automatically deployed via Firebase App Hosting.

### 2. Backend: Firebase Functions (2nd Gen) & Genkit Framework
- **Cloud Functions for Firebase:** Serverless functions written in TypeScript (Node.js 18+) handling backend logic, API integrations (Shopify, Google Ads, Google Analytics), and Genkit orchestration.
- **Firebase Genkit:** An open-source framework for building, deploying, and monitoring production-ready AI-powered apps. It forms the backbone of our multi-agent system, allowing for structured and observable AI logic.

### 3. Database: Cloud Firestore
- A NoSQL cloud database providing real-time synchronization capabilities.
- Stores core application data including user profiles, product catalog, orders, analytics events, campaign data, and agent task queues.

### 4. AI Multi-Agent System
A core component of the application, orchestrated by Genkit, featuring specialized AI agents designed for specific tasks:
- **Analytics Agent:** Processes Google Analytics data and generates actionable insights.
- **Campaign Agent:** Manages and optimizes Google Ads campaigns.
- **Customer Agent:** Handles customer service queries and provides product recommendations.
- **Inventory Agent:** Integrates with Shopify for stock management.
- **Supervisor Agent:** Coordinates tasks and routes requests among other agents.

### 5. Essential Integrations
- **Shopify:** Webhook-driven integration for real-time order and product data synchronization.
- **Google Analytics 4 Data API:** For comprehensive e-commerce analytics and reporting.
- **Google Ads API:** For programmatic campaign management and optimization.
- **Vertex AI Gemini:** Used by Genkit for advanced AI processing and model capabilities.

### 6. Authentication & Hosting
- **Firebase Authentication:** Secure user management with Email/Password and Google OAuth sign-in methods.
- **Firebase App Hosting:** Provides a fully managed, high-performance hosting solution for the Next.js frontend, with seamless integration into the Firebase ecosystem and automatic deployments from GitHub.

## Local Development Setup

To get started with local development:

1.  **Clone this repository.**
2.  Ensure you have Node.js (18+) and Firebase CLI installed (`npm install -g firebase-tools`).
3.  Navigate to the project root and run `firebase init` if not already done, selecting `Functions`, `App Hosting`, `Firestore`, and `Storage`.
4.  Configure Firebase Emulators by running `firebase emulators:start`.
5.  Set up required environment variables as Firebase Cloud Functions secrets.

_More detailed setup instructions will be provided as the project develops._


    ```bash
    git push origin main
    ```

To będzie bardzo solidny dodatek do Twojego repozytorium!
