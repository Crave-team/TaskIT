import nodemailer from 'nodemailer';

/**
 * The senders plugged into the services (`setMailer`) to deliver sign-in codes.
 *
 * `createSmtpMailer` sends through a real mail account over SMTP (for Gmail: smtp.gmail.com with an "app password",
 * see .env.example). Failures are logged here, WITHOUT the message body (it holds the code), and rethrown so the
 * service can answer "could not send" without leaking SMTP details to the browser.
 *
 * `createConsoleMailer` is for local development only: it prints the message in the server window so the app can be
 * tried without any mail account. It is never selected in production (see `chooseMailer`).
 */
export function createSmtpMailer({ host, port, secure, user, pass, from }, transport = nodemailer.createTransport({ host, port, secure, auth: { user, pass } }), log = console) {
  return async ({ to, subject, text }) => {
    try {
      await transport.sendMail({ from, to, subject, text });
    } catch (e) {
      log.error(`[mail] could not send to ${to}: ${e.code || e.message}`);
      throw e;
    }
  };
}

export function createConsoleMailer(write = console.log) {
  return async ({ to, subject, text }) => {
    write(`\n[mail:dev] To: ${to}\n[mail:dev] Subject: ${subject}\n${text.split('\n').map((l) => `[mail:dev] ${l}`).join('\n')}\n`);
  };
}

/**
 * Picks the sender from the server config: SMTP when it is configured; the console in development; nothing otherwise
 * (production without SMTP, or tests), in which case email codes are unavailable.
 */
export function chooseMailer(config) {
  const { smtp } = config;
  if (smtp?.host && smtp.user && smtp.pass) return { mode: 'smtp', mailer: createSmtpMailer(smtp) };
  if (config.env === 'development') return { mode: 'console', mailer: createConsoleMailer() };
  return { mode: 'off', mailer: null };
}
