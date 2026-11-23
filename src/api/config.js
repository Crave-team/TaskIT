/**
 * Server-side configuration. In the Node/Express backend these come from environment
 * variables (e.g. `process.env.ADMIN_INVITE_CODE`); never ship real secrets in front-end code.
 */
/** Defaults for the single site-settings document (System Settings page). */
export const DEFAULT_SYSTEM_SETTINGS = {
  require2fa: false,
  notifyDeadlines: true,
  sessionTimeout: '60',
};

export const config = {
  /** Code required to register an ADMIN account. Change it before sharing the site. */
  ADMIN_INVITE_CODE: 'ADMIN-2026',
  /**
   * OAuth client ID of the Google "Web application" credential. Empty = Google sign-in is off. The ID is public
   * (the browser needs it), so it is safe to expose; the server sets it from `GOOGLE_CLIENT_ID`.
   */
  GOOGLE_CLIENT_ID: '',
  /**
   * Email codes ("2-step sign-in"): after the password is right, a 6-digit code is emailed and must be entered.
   * `EMAIL_CODE_REQUIRED` makes it compulsory for everyone (and for sign-up, which then proves the email is real);
   * otherwise a person can opt in from Settings. The server sets the first one from its environment.
   */
  EMAIL_CODE_REQUIRED: false,
  EMAIL_CODE_TTL_SECONDS: 600,        // a code works for 10 minutes
  EMAIL_CODE_RESEND_SECONDS: 60,      // wait this long before asking for another
  EMAIL_CODE_MAX_ATTEMPTS: 5,         // wrong guesses allowed per code
  EMAIL_CODE_MAX_SENDS: 5,            // codes (first + resends) per sign-in attempt
  EMAIL_CODE_MAX_PER_HOUR: 10,        // sign-in attempts per email address per hour
  /** Maximum size of one uploaded file. */
  MAX_FILE_BYTES: 10 * 1024 * 1024,
  /** Default page size for list endpoints. */
  PAGE_SIZE: 100,
};
