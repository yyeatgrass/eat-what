# eat what

A shared weekday lunch picker for a small group. One page, one restaurant list, one live election. No accounts.

Anyone with the URL sees the same list and the same pick. The clock is Asia/Shanghai, plus the server time. That decides which day it is. Monday through Friday, today's list starts as every restaurant not already chosen earlier that week. Anyone can remove a place from today's list without deleting it from the whole list. The draw uses only today's list. Pick again replaces today and skips the current result when another place is still on today's list. Saturday and Sunday show a weekend state and leave the list alone. When the week changes, that week's picks reset. Restaurants stay.

## Run it locally

Local development does not need a Cloudflare account or any secrets.

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:43123](http://127.0.0.1:43123) on the same computer that is running the dev server. That address is not reachable from a phone or another machine.

`npm test` checks the weekday, week, and election rules.

## Open it on a phone or another computer

With `npm run dev` still running, start a temporary public tunnel:

```bash
cloudflared tunnel --url http://127.0.0.1:43123
```

Install [cloudflared](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/) first if you do not have it. The command prints an `https://….trycloudflare.com` link. Open that link on a phone, laptop, or any other device. Everyone on it shares one lunch room. The link works only while both the dev server and the tunnel stay running.

For an address that stays up after you close the laptop, deploy to your Cloudflare account below.

## Deploy

You already have a Cloudflare account (signed in with GitHub). Deploying is a one-time login, then one command. You do not need to deploy for the app to work on your machine.

### Pricing

Checked October 3, 2026 against the [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) page (last updated September 30, 2026).

Durable Objects are available on the **Workers Free** plan when they use the SQLite storage backend. This app uses that backend (`new_sqlite_classes`), so a free account is enough. The Workers Paid plan is $5 per month and is not required. It raises the included limits.

On the free plan, Durable Objects include 100,000 requests per day and 13,000 GB-s of duration per day. Incoming WebSocket messages are billed at a 20:1 ratio toward requests. Past a daily free limit, further operations of that type fail until 00:00 UTC. A small lunch group stays inside that allowance. WebSocket hibernation keeps the room from running while everyone is idle.

### Install Wrangler

Wrangler is already a dependency of this repo. `npm install` installs it. Use the local copy through `npx`, as the commands below do.

### Log in once

Browser OAuth, with the GitHub account that already has Cloudflare access:

```bash
npx wrangler login
```

Or create an API token in the Cloudflare dashboard ([API tokens](https://dash.cloudflare.com/profile/api-tokens)) and export it in your shell as `CLOUDFLARE_API_TOKEN`. Do not paste the token into the app, and do not commit it.

### Deploy

```bash
npm run deploy
```

That builds the client and worker, then runs `wrangler deploy`. The worker name is `eat-what`.
