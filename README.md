# WhiteRock Tasks

> Developed and delivered by **Nerdshouse Technologies LLP**

---

## About

WhiteRock Tasks is a task management web application for teams. It provides Firebase-backed authentication, role-based access (Owner, Manager, Doer, Auditor), task assignment with due dates and priorities, a task table with filtering and pagination, KPI views per member, removal requests, holidays and absences (Settings), and optional WhatsApp notifications via 11za when assigning tasks. File attachments for tasks are stored in Firebase Storage.

## Tech Stack

| Layer    | Technology                          |
|----------|-------------------------------------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS 4, React Router, Lucide React |
| Backend  | Firebase (Auth, Firestore, Storage), Firebase Cloud Functions        |
| Database | Cloud Firestore                     |
| Hosting  | Static build (Vite); deployable to Firebase Hosting or any static host |
| Other    | Axios, 11za WhatsApp API (template messages) |

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Firebase project (for Auth, Firestore, Storage, optional Functions)
- 11za account (optional, for WhatsApp task-assignment notifications)

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd <project-folder>

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Fill in required values in .env (Firebase config and, if needed, 11za)
```

### Running Locally

```bash
npm run dev
```

Open the URL shown (e.g. http://localhost:5173).

### Building for Production

```bash
npm run build
```

Output is in `dist/`. To preview:

```bash
npm run preview
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| VITE_FIREBASE_API_KEY | Firebase Web API key | Yes |
| VITE_FIREBASE_AUTH_DOMAIN | Firebase auth domain | Yes |
| VITE_FIREBASE_PROJECT_ID | Firebase project ID | Yes |
| VITE_FIREBASE_STORAGE_BUCKET | Firebase Storage bucket | Yes |
| VITE_FIREBASE_MESSAGING_SENDER_ID | Firebase messaging sender ID | Yes |
| VITE_FIREBASE_APP_ID | Firebase app ID | Yes |
| VITE_FIREBASE_MEASUREMENT_ID | Firebase Analytics measurement ID | Yes |
| VITE_11ZA_API_URL | 11za template API URL | No (defaults to 11za endpoint) |
| VITE_11ZA_ORIGIN_WEBSITE | Origin website for 11za | No (defaults to whiterock.co.in) |
| VITE_11ZA_AUTH_TOKEN | 11za auth token for WhatsApp | No (required only for WhatsApp sends) |
| VITE_11ZA_TEMPLATE_TASK_ASSIGNMENT | 11za template name for task assignment | No (optional) |
| VITE_11ZA_TEMPLATE_DAILY_TASKS | 11za template for daily reminders | No (optional) |

## Project Structure

```
├── index.html              # App entry HTML
├── package.json            # Dependencies and scripts
├── vite.config.ts          # Vite configuration
├── postcss.config.js       # PostCSS / Tailwind
├── tsconfig.json           # TypeScript config
├── firebase.json           # Firebase config (Firestore, Storage, Functions)
├── firestore.rules         # Firestore security rules
├── firestore.indexes.json  # Firestore indexes
├── storage.rules           # Storage security rules
├── storage.cors.json       # Storage CORS for uploads
├── .env.example            # Example environment variables
├── src/
│   ├── main.tsx            # React entry
│   ├── App.tsx             # Routes and layout wrapper
│   ├── index.css           # Global and Tailwind styles
│   ├── types.ts            # Shared TypeScript types
│   ├── vite-env.d.ts       # Vite env typings
│   ├── contexts/
│   │   └── AuthContext.tsx # Auth state and login
│   ├── components/
│   │   ├── Layout.tsx      # Sidebar and main layout
│   │   └── ui/
│   │       ├── Button.tsx  # Reusable button
│   │       └── Input.tsx   # Reusable input
│   ├── lib/
│   │   ├── firebase.ts     # Firebase init and helpers
│   │   └── utils.ts        # KPI, holidays, recurring options
│   ├── services/
│   │   ├── api.ts         # Firestore and API wrappers
│   │   └── whatsapp.ts    # 11za WhatsApp integration
│   └── pages/
│       ├── Login.tsx
│       ├── AssignTask.tsx
│       ├── TaskTable.tsx
│       ├── Kpi.tsx
│       ├── RedZone.tsx
│       ├── RemovalRequest.tsx
│       ├── Members.tsx
│       ├── Settings.tsx
│       └── BogusAttachment.tsx
└── functions/              # Firebase Cloud Functions (optional)
    ├── package.json
    ├── tsconfig.json
    └── src/
        └── index.ts
```

## Deployment

- **Web app:** Run `npm run build` and deploy the `dist/` folder to Firebase Hosting, Vercel, Netlify, or any static host. Configure environment variables in the host’s dashboard.
- **Firebase:** If using Firestore, Storage, or Cloud Functions, use `firebase deploy` (Firestore rules, indexes, Storage rules, and Functions are defined in `firebase.json`).

## Third-Party Services

| Service | Purpose | Setup Required |
|---------|---------|----------------|
| Firebase | Auth, Firestore, Storage, optional Analytics | Create project, enable Auth/Firestore/Storage, add config to `.env` |
| 11za | WhatsApp template messages for task assignment | Account and template in 11za; set `VITE_11ZA_AUTH_TOKEN` (and optional template names) in `.env` |

---

## Developed By

**Nerdshouse Technologies LLP**  
🌐 [nerdshouse.com](https://nerdshouse.com)  
📧 axit@nerdshouse.com

---

*© 2026 WhiteRock (Royal Enterprise). All rights reserved. Developed by Nerdshouse Technologies LLP.*
