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
