/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore, Timestamp } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAnalytics, isSupported } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const hasFirebaseConfig =
  typeof firebaseConfig.apiKey === 'string' &&
  firebaseConfig.apiKey.length > 0 &&
  typeof firebaseConfig.projectId === 'string' &&
  firebaseConfig.projectId.length > 0;

if (!hasFirebaseConfig) {
  throw new Error(
    'Missing Firebase config. Copy .env.example to .env and add your Firebase project credentials (VITE_FIREBASE_API_KEY, VITE_FIREBASE_PROJECT_ID, etc.). See README.'
  );
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

setPersistence(auth, browserLocalPersistence).catch(console.warn);

// Analytics only in supported browser environments
let analytics: ReturnType<typeof getAnalytics> | null = null;
isSupported().then((yes) => {
  if (yes) analytics = getAnalytics(app);
});

export { db, auth, app, storage, analytics };

export const timestampToISO = (t: any): string => {
  if (t?.toDate) return t.toDate().toISOString();
  if (t instanceof Date) return t.toISOString();
  return t || new Date().toISOString();
};

export const isoToTimestamp = (iso: string) => Timestamp.fromDate(new Date(iso));

export const COLLECTIONS = {
  TASKS: 'tasks',
  USERS: 'tasks_users',
  HOLIDAYS: 'holidays',
  ABSENCES: 'absences',
  REMOVAL_REQUESTS: 'removal_requests',
  PASSWORD_RESET_OTPS: 'password_reset_otps',
  HELP_TICKETS: 'help_tickets',
};
