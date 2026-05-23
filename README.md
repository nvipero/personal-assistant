# Päivän Assistentti — Personal Assistant PWA

Henkilökohtainen aamuassistentti puhelimeen. Lähettää joka aamu push-notifikaationa AI-generoidun yhteenvedon Google Kalenterista ja Gmailista. Asennetaan PWA:na suoraan selaimesta kotinäytölle.

## Tekninen pino

- **Frontend**: Vite + React 18 + TypeScript (strict) + Tailwind CSS v3 + shadcn/ui + React Router v6 + Zustand + TanStack Query v5
- **Backend**: Supabase (Postgres + Auth + Edge Functions / Deno) + pg_cron + pgcrypto
- **LLM**: Anthropic Claude Haiku 4.5 (`claude-haiku-4-5`)
- **Push**: Web Push API + VAPID
- **Hosting**: Cloudflare Pages

## Paikallinen kehitys

### 1. Kloonaa ja asenna

```bash
git clone <repo-url>
cd personal-assistant
pnpm install
```

### 2. Ympäristömuuttujat

```bash
cp .env.example .env.local
# Muokkaa .env.local — täytä Supabase URL, Anon Key, VAPID public key, Google Client ID
```

### 3. Supabase paikallisesti (valinnainen)

```bash
# Asenna Supabase CLI ensin: https://supabase.com/docs/guides/cli
pnpm dlx supabase start
```

### 4. Käynnistä dev-palvelin

```bash
pnpm dev
```

Sovellus aukeaa osoitteessa http://localhost:5173

## Migraatiot (tietokanta)

```bash
# Aja migraatiot linkitettyyn Supabase-projektiin
pnpm dlx supabase db push
```

**Huom**: Migraatio 003 sisältää pg_cron-ajastuksen. Sen jälkeen aja Supabasen SQL Editorissa kerran:

```sql
ALTER DATABASE postgres SET app.edge_url = 'https://xxxxx.supabase.co';
ALTER DATABASE postgres SET app.service_role_key = 'eyJ...service_role_key...';
```

(Service role key: Supabase Dashboard → Settings → API)

## Edge Functions deploy

```bash
pnpm dlx supabase functions deploy generate-summary
pnpm dlx supabase functions deploy manual-generate-summary
pnpm dlx supabase functions deploy google-oauth-handler
pnpm dlx supabase functions deploy push-subscribe
pnpm dlx supabase functions deploy push-unsubscribe
pnpm dlx supabase functions deploy feedback-to-memory
```

## Secrets (Edge Functions)

Aseta kaikki secrets ennen deployia:

```bash
pnpm dlx supabase secrets set ANTHROPIC_API_KEY=sk-ant-api03-...
pnpm dlx supabase secrets set GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
pnpm dlx supabase secrets set GOOGLE_CLIENT_SECRET=GOCSPX-...
pnpm dlx supabase secrets set VAPID_PUBLIC_KEY=B...
pnpm dlx supabase secrets set VAPID_PRIVATE_KEY=...
pnpm dlx supabase secrets set VAPID_SUBJECT=mailto:sinun@email.fi
pnpm dlx supabase secrets set ENCRYPTION_KEY=<64 hex-merkkiä, generoi: openssl rand -hex 32>
```

VAPID-avainparin generointi:

```bash
npx web-push generate-vapid-keys
```

## TypeScript-tyypit Supabasesta

Generoi tyypit linkitetystä projektista:

```bash
pnpm dlx supabase gen types typescript --linked > src/types/database.ts
```

## Cloudflare Pages -deployment

1. Push GitHubiin: `git push origin main`
2. Kirjaudu Cloudflare Dashboardiin → Pages → Create a project
3. Yhdistä GitHub-repo
4. Build settings:
   - **Build command**: `pnpm build`
   - **Build output directory**: `dist`
5. Environment variables → Add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_VAPID_PUBLIC_KEY`
   - `VITE_GOOGLE_CLIENT_ID`
6. Deploy
7. Lisää production-URL Google Console -projektiin:
   - APIs & Services → Credentials → OAuth 2.0 Client IDs
   - Authorized JavaScript origins: `https://your-domain.pages.dev`
   - Authorized redirect URIs: `https://your-domain.pages.dev/connect-google/callback`
8. Lisää URL myös Supabasen Auth asetuksiin:
   - Authentication → URL Configuration → Redirect URLs → lisää `https://your-domain.pages.dev/**`

## Vianetsintä

### "Google-tiliä ei yhdistetty" vaikka yhdistin

Tarkista Edge Functionin lokit Supabase Dashboardista. Todennäköisin syy: `GOOGLE_CLIENT_SECRET` tai `ENCRYPTION_KEY` ei asetettu oikein.

### Push-notifikaatiot eivät tule iPhonelle

iOS vaatii että sovellus on lisätty aloitusnäyttöön (Jaa → "Lisää aloitusnäyttöön"). Safari-selain ei tue push-notifikaatioita.

### "Aktiivista system-promptia ei löydy"

Varmista että migraatio 004 (seed_prompts.sql) on ajettu ja `prompt_versions`-taulussa on rivi `name='daily_summary_system'` `is_active=true`.

### pg_cron ei triggeröi

Varmista että `app.edge_url` ja `app.service_role_key` on asetettu tietokantaan (kohta Postgres-asetukset yllä). Tarkista cron-ajastukset: `select * from cron.job;`

### TypeScript-virheet build-vaiheessa

```bash
pnpm dlx supabase gen types typescript --linked > src/types/database.ts
pnpm tsc --noEmit
```
