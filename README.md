# NoChickenCall
<sub>别计较</sub>

**Travel together. Don't sweat the split.**

NoChickenCall is a group-trip expense app. Log what everyone pays during the trip, in any currency. At the end it works out the **fewest bank transfers** that settle everyone up, and tracks those payments until the trip is fully settled.

It's a Progressive Web App: open it in your phone's browser and add it to your home screen. There's nothing to download from an app store.

**Live app:** https://nochickencall.onrender.com

## Highlights

- 🧾 Expenses in 17 currencies, converted at that day's rate (or your own)
- ➗ Split equally, by amounts, by percentage, or by shares, with one or several payers
- ⚖️ Live balances that always add up to the cent
- 💸 Settle up with the proven minimum number of transfers
- ✅ "I've sent it" / "Got it" tracking until everyone is settled
- 🔗 Invite friends with a link or QR code, no email or phone number needed
- 📲 Installs on iPhone and Android, and opens even with no signal

## Documentation

| | |
|---|---|
| [User guide](docs/USER_GUIDE.md) | How to use the app, step by step |
| [Features](docs/FEATURES.md) | Everything the app does today |
| [Phases](docs/PHASES.md) | Roadmap and what each phase delivered |
| [Changelog](CHANGELOG.md) | What changed, version by version |
| [Architecture](docs/ARCHITECTURE.md) · [Deploy](docs/DEPLOY.md) · [Testing](docs/TESTING.md) | Technical docs (final versions come at release) |
| [Spec](docs/SPEC.md) | Original product requirements |

## Run it locally

Needs Node 22+, pnpm 10 and PostgreSQL 16.

```bash
pnpm install
cp .env.example .env
docker compose up -d db
pnpm db:migrate
pnpm dev            # http://localhost:5173
```

More detail (production build, tests, deployment) is in the technical docs above.
