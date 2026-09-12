# Telegram HR bot

Standalone Node.js Telegram long-polling bot for HR Prime candidate applications.
No public domain or webhook secret is required.

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
HR_MANAGER_USERNAME=hrinformhr
HR_MANAGER_CHAT_ID=
POLICY_URL=https://example.com/privacy
PERSONAL_DATA_URL=https://example.com/personal-data
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
Replace example policy URLs with your actual published documents.

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
