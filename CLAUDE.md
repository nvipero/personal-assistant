# CLAUDE.md — Personal Assistant

Henkilökohtainen assistentti-PWA. Aamuisin generoitu LLM-yhteenveto (sähköposti, kalenteri, tehtävät, sää, siitepöly) toimitettuna push-ilmoituksena.

## Dokumentaatio

`docs/`-kansio sisältää kolme ylläpidettävää dokumenttia:

- `docs/architecture.md` — järjestelmän nykytila: mitä on toteutettu ja miksi rakenne on sellainen kuin on
- `docs/backlog.md` — tietoisesti ulos-scopatut asiat ja perustelut
- `docs/nykytila-kartoitus.md` — toteutustilanne feature-tasolla

**Päivitä aina** kun teet muutoksia jotka muuttavat jotain seuraavista:
- arkkitehtuuri tai tekninen pino
- uusi connector tai tietolähde
- tietomallin muutos (uusi taulu tai merkittävä sarakemuutos)
- uusi tai poistuva Edge Function
- scopeen tai designperiaatteisiin vaikuttava päätös

Pienet bugikorjaukset (kuten aikavyöhykebugi) eivät yleensä vaadi päivitystä ellei korjaus paljasta rakenteellisen ongelman.

## Tekninen pino

| Kerros | Valinta |
|---|---|
| Frontend | React + TypeScript + Vite, Tailwind, shadcn/ui, TanStack Query |
| Hosting | Cloudflare Pages |
| Backend | Supabase: Postgres + Edge Functions (Deno) + Auth + pg_cron |
| LLM | Anthropic Claude Haiku 4.5 |
| Push | Web Push (VAPID) |

## Deploy

```bash
# Edge Function deploy
pnpm dlx supabase functions deploy <function-name>

# Frontend (tapahtuu automaattisesti Cloudflare Pages -commitissa)
```

## Tärkeät periaatteet (älä riko näitä)

- **Jokainen connector on irrotettavissa** — yksittäisen tietolähteen virhe ei saa kaataa koko yhteenvedon generointia
- **Päivämäärät aina käyttäjän aikavyöhykkeessä** — käytä `formatInTimeZone` date-fns-tz:stä, ei UTC-pohjaisia muodostuksia
- **Budjettiraja 10 €/kk** — ei turhia API-kutsuja, ei kalliita malleja ilman hyvää syytä
- **Tietokantapohjainen konfiguraatio** — promptit ja asetukset kantaan, ei koodiin
