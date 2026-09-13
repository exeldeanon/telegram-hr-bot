# Telegram HR bot

Standalone Node.js Telegram long-polling bot for UpHire candidate applications.
No public domain or webhook secret is required.

## UpHire start menu

`/start` and `/menu` show the supplied UpHire logo and an inline panel:
vacancies, about, manager contact, website, application, FAQ, process and training.
Navigation edits its panel when possible and never resets application answers.
Candidate input and the previous active bot card are removed after each step, so the
private chat stays as a single clean interface. Messages from older releases whose IDs
were never stored cannot be discovered or deleted safely; all new screens are tracked.
Browse vacancies before consent; applying still requires the existing consent step.
`/restart` now asks for confirmation before replacing a draft; submitted applications,
training progress and the CRM outbox remain unchanged. Manager contact uses the
existing `HR_MANAGER_USERNAME`; the website is https://up-hire.ru.

Logo: `assets/uphire-logo.jpg` (user-supplied, unchanged). Image delivery falls back
to the same usable text menu if Telegram rejects or cannot load the photo.
Run `npm test` for the full funnel, menu, upload, persistence, training and CRM tests.

## Hosting settings

- Language: Node.js
- Node.js version: 22
- Branch: main
- Build command: leave empty, or use `npm install`
- Start command: `npm start`

## Environment variables

Set these in the hosting panel:

```env
TELEGRAM_BOT_TOKEN=123456789:replace_me
HR_MANAGER_USERNAME=UpHireManager1
HR_MANAGER_CHAT_ID=
POLICY_URL=https://up-hire.ru/policy
PERSONAL_DATA_URL=https://up-hire.ru/personal-data
DATA_DIR=/app/data
```

`HR_MANAGER_CHAT_ID` is optional. If it is empty, the bot will show the
candidate a ready application and ask them to forward it to the HR manager.

## Deployment

Redeploy the latest `main` from GitHub. Entry file: `src/server.js`.
Keep only one running instance per token; do not start another in the console.
Disable automatic webhook registration in the hosting panel if enabled.
The bot deletes its old webhook on startup without dropping pending updates.

Look for `Telegram HR bot long polling started` in runtime logs, then send `/start`.
Set `DATA_DIR=/app/data` on BotHost for persistent candidate state.
Without DATA_DIR, local state remains in `storage/`.
The bot uses the canonical UpHire policy URLs in its menu and consent screen.

The old TELEGRAM_WEBHOOK_SECRET variable is ignored and can be removed.
HTTP port 3000 is only used for health checks; a public-domain 404 does not block polling.
A polling error 409 indicates another consumer or webhook using the token.

## Telegram admin panel

After redeploying, send `/myid` in a private chat with this bot. Set that numeric
value as `ADMIN_TELEGRAM_ID` in hosting environment variables and restart.
Keep `DATA_DIR=/app/data` so statistics, applications and queued notifications survive redeploys.
Never put a username or bot token in ADMIN_TELEGRAM_ID. Without it admin access is disabled.

- `/admin`: total and today's (Europe/Moscow) unique users who sent /start or /restart,
  unique users who gave their first valid name answer, and submitted application count.
- `/applications`: paginated application list; `/applications 2` opens page 2.
- `/application 3`: full application by its ID from the list.
- `/myid`: shows the caller's ID, without granting admin access.

Admin commands only work for the configured user in private chat. The admin receives
start, first-answer and full-submission notifications, including Telegram user ID and
username when available. Open the bot and send /start first so it can message you.
Notification errors do not discard applications; pending notifications retry while polling.
ADMIN_TELEGRAM_ID is the primary recipient; HR_MANAGER_CHAT_ID remains a fallback when no admin is configured.
Do not run multiple processes on the same storage directory/token.

Statistics start with this update; historical submissions cannot be reconstructed.
Simply opening the chat is not observable. Repeated /start counts as another notification,
but not another unique visitor in the same reporting period. Repeated submit presses
do not add an application; /restart allows a new one. Notification delivery is at-least-once:
an interruption just after sending can cause a repeated notification with the same event ID.

## Mini App, lead statuses and daily training

1. Redeploy the current main branch. Keep one process, PORT=3000 and persistent DATA_DIR=/app/data.
2. Configure ADMIN_TELEGRAM_ID as before. Open /admin → applications → application.
3. Each application has statuses: Заполнил анкету (default), Слетел, Холд, Выплачено.
   The card shows username (if available), Telegram ID, application age and current hold duration.
   Выплачено is a bookkeeping label only: it does not initiate any payment.
4. Click Отправить на обучение. The course is selected from the application's vacancy.
   Legacy applications infer the vacancy from their saved text. Repeated assignment does not reset progress.
5. The first PDF is delivered on the next polling maintenance pass (normally within 30 seconds).
   Later PDFs arrive no sooner than 24 hours after the previous successful delivery.
   After downtime, only the next lesson is sent, not a burst of missed days. There are five days.
   Холд and Слетел pause new lessons; change back to Заполнил анкету to resume.
   Already delivered lessons remain accessible. A new day does not require passing the prior test.
6. Ознакомился opens three questions; two correct answers pass the day. Failed tests can be retried.
7. «Моё обучение» shows the candidate's current day, passed and attempted tests,
   total attempts and the passing attempt for every completed day. The current PDF can
   be downloaded again, and an interrupted or failed test can be resumed from the panel.
   All five daily tests must pass to complete the course. Results are sent to the administrator.
   Daily delivery state, attempts and pending admin messages persist in admin.json inside DATA_DIR.

For the visual Mini App, the SAME Node server serves /app and authenticated /api/* endpoints.
It needs a publicly reachable HTTPS reverse proxy to port 3000, even though Telegram updates use polling.
The previously broken BotHost public domain must be repaired by hosting support or the server hosted
on another Node hosting service with HTTPS. A 404 from the hosting proxy cannot be fixed by setting an env var.
Once https://YOUR-DOMAIN/app loads, set MINI_APP_URL=https://YOUR-DOMAIN/app and restart.
Open /app in the bot or /admin, then click Открыть UpHire. A normal browser does not have Telegram
authorization; the public landing screen intentionally contains no candidate data.

Authentication validates Telegram Mini App initData HMAC and a one-hour expiry on the server.
Only ADMIN_TELEGRAM_ID can change statuses or assign courses. Candidates see only their own
applications, delivered lessons and tests. Quiz answer keys stay server-side until a test is submitted.
There is no demo login or bypass in production. Refreshing a stale session requires reopening the Mini App.

Materials: 20 original user-provided PDFs, preserved byte-for-byte in materials/; their extracted text
is in src/courses.json for reading within the Mini App. No Python is needed on the hosting server.
src/quizzes.js contains 60 authored questions with explanations, three per supplied lesson.
Lessons contain illustrative/unverified financial terms and some unsafe advice; a visible notice
clarifies that current employer policies govern work and passwords/PIN/CVV/SMS codes must not be shared.
Tests assess stable concepts and do not endorse outdated rates, guaranteed earnings or unsafe instructions.
Banking-security reference: https://www.cbr.ru/information_security/pmp/
Telegram authentication reference: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app

Validation: npm test. Optional browser regression: node scripts/check-miniapp.mjs PATH_TO_PLAYWRIGHT.
The browser check uses a temporary database and fake signed Telegram identities, never real candidates.
No system cron or external scheduler is required. The bot must remain running for timely daily delivery.
PDF delivery is at-least-once: a crash between send and persistence can resend that day's material.
