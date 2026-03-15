# Changelog

## [1.0.0] - 2026-02-23

### Delivered

- **Authentication:** Firebase Auth with email/password; role-based access (Owner, Manager, Doer, Auditor).
- **Task management:** Create, assign, update, delete tasks; due dates, priorities, recurrence options; task table with search, filters, pagination, and attachment support (Firebase Storage).
- **Assign Task:** Dedicated page to assign tasks to users with optional WhatsApp notification via 11za template API.
- **KPI:** Per-member KPI view (assigned, on-time/late completed, overdue) with holiday and absence awareness.
- **Red Zone:** View for overdue or at-risk tasks.
- **Removal requests:** Workflow for requesting removal from tasks.
- **Members:** User management (add/edit) backed by Firestore.
- **Settings:** Holidays and absences configuration.
- **Bogus attachment:** Utility page for attachment handling.
- **Backend:** Firestore collections (tasks, tasks_users, holidays, absences, removal_requests); Firebase Storage for files; optional Cloud Functions in `functions/`.

### Tech Debt / Known Issues

- `npm audit` reports moderate (esbuild/vite dev server) and high (undici, transitive via Firebase) vulnerabilities; fixing fully would require a major Vite upgrade.
- Large bundle warning: consider code-splitting or manual chunks for the main JS bundle.
- Daily WhatsApp reminder (daily tasks) is not implemented; only task-assignment WhatsApp is wired.

---

*Developed by [Nerdshouse Technologies LLP](https://nerdshouse.com)*
