/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  readonly VITE_FIREBASE_MEASUREMENT_ID: string;
  readonly VITE_11ZA_API_URL: string;
  readonly VITE_11ZA_ORIGIN_WEBSITE: string;
  readonly VITE_11ZA_AUTH_TOKEN: string;
  readonly VITE_11ZA_TEMPLATE_TASK_ASSIGNMENT: string;
  readonly VITE_11ZA_TEMPLATE_DAILY_TASKS: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
