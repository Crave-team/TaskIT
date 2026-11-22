import { ApiError } from './errors.js';

/**
 * Sign-in codes are sent by email, and only a server can send email. Like the repository, the session store and
 * the Google verifier, the sender is plugged in from outside so the services stay free of any mail library:
 *
 *   - Express server: `setMailer(createSmtpMailer(...))` (a real SMTP account such as Gmail), or in development a
 *     console mailer that prints the message in the server window.
 *   - Browser-only demo: nothing is plugged in, so email codes are unavailable there (and never required).
 *
 * A mailer takes `{ to, subject, text }` and resolves when the message has been handed to the mail server.
 */
let mailer = null;

/** @param {((message: { to: string, subject: string, text: string }) => Promise<void>) | null} impl */
export const setMailer = (impl) => { mailer = impl; };
export const hasMailer = () => mailer !== null;

export async function sendMail(message) {
  if (!mailer) throw new ApiError(503, 'EMAIL_CODE_UNAVAILABLE', 'Sign-in codes cannot be emailed right now. Please try again later.');
  try {
    await mailer(message);
  } catch {
    // The reason (bad SMTP password, mailbox full, ...) belongs in the server log, never in the browser.
    throw new ApiError(502, 'EMAIL_SEND_FAILED', 'We could not send the code email. Check the address and try again.');
  }
}
