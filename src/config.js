/**
 * Frontend runtime config.
 *
 * Override via frontend/.env — see .env.example
 *   VITE_API_URL       → backend /exec endpoint
 *   VITE_ADMIN_PASS    → admin panel unlock password
 *   VITE_ATTEND_PASS   → attendance/scanner unlock password
 */

const config = {
  ADMIN_PASS: import.meta.env.VITE_ADMIN_PASS || '8031',
  ATTEND_PASS: import.meta.env.VITE_ATTEND_PASS || '8031',

  WORKSTATIONS: [1, 2, 3, 4, 5, 6, 15, 16, 17, 18, 19, 20],

  // Legacy name kept so api/sheets.js keeps working without a rename
  GOOGLE_SHEETS: {
    API_URL: import.meta.env.VITE_API_URL || 'http://localhost:4000/exec',
  },
}

export default config
