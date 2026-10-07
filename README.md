# SystemBot222 — ENO Store

A fresh Discord bot project built as grouped slash commands with exactly **222 features**. Discord's application-command UI has practical top-level limits, so the 222 features are grouped under 25 slash command categories such as `/admin`, `/mod`, `/tickets`, `/store`, `/rating`, `/utility`, etc.

## What is included
- 222 registered subcommands/features.
- ENO Store ticket panel with Buy / Inquiry flows.
- Rating system: type `<تقييم>`, choose 5/4/3/2/1, then write the review. The final review is a single generated image.
- Rating panel image and colored rating buttons.
- Moderation, automod, anti-link/image/invite/spam, welcome + autorole, logs.
- Roles/channels/voice tools.
- Economy, levels, giveaways, polls, suggestions, reminders, AFK, reports.
- JSON persistence in `data/db.json`.
- HTTP health endpoint for hosting.
- Backup commands for bot data.
- Does not contain or touch a music/voice playback system.

## Install
1. Install Node.js 18.20+ (Node 20/22 recommended).
2. Copy `.env.example` to `.env`.
3. Fill `TOKEN`, `CLIENT_ID`, `GUILD_ID`, and any IDs you want to use.
4. Run `npm install`.
5. Run `npm run check`.
6. Run `npm run register` once after creating/configuring the Discord application.
7. Run `npm start`.

## Discord Developer Portal
Enable these privileged intents in Bot settings:
- Server Members Intent
- Message Content Intent

Invite the bot with the `bot` and `applications.commands` scopes and permissions suitable for your server. For ticket/moderation/role/channel features, Administrator is the simplest setup while testing; tighten permissions later.

## Important
Never paste your bot token into chat. Put it only in `.env`.
