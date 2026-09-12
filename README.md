# Telegram HR bot

Standalone Node.js Telegram webhook bot for HR Prime candidate applications.

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
TELEGRAM_WEBHOOK_SECRET=replace_with_long_random_secret
HR_MANAGER_USERNAME=hrinformhr
HR_MANAGER_CHAT_ID=
POLICY_URL=https://example.com/privacy
PERSONAL_DATA_URL=https://example.com/personal-data
```

`HR_MANAGER_CHAT_ID` is optional. If it is empty, the bot will show the
candidate a ready application and ask them to forward it to the HR manager.

## Webhook

After deployment, set Telegram webhook to:

```text
https://your-hosting-domain.ru/webhook
```

Use the same value from `TELEGRAM_WEBHOOK_SECRET` as Telegram `secret_token`.
