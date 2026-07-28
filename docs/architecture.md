# Architecture

> **Tarkoitus:** Kuvaa järjestelmän nykytila päätös- ja navigaatiotasolla. Vastaa kysymyksiin "mitä on toteutettu" ja "miksi rakenne on tällainen". **Ei** korvaa koodia implementaatiodetaljien lähteenä — koodi on totuuden lähde sille miten asiat toimivat, tämä dokumentti sille miten ne on järjestetty ja miksi.
>
> **Ylläpito:** Päivitetään aina kun rakennetaan jotain merkittävää uutta tai muutetaan olemassa olevaa rakennetta. Yksittäiset feature-suunnitelmat (esim. uusi connector) luetaan tämän dokumentin pohjalta, ja kun ne toteutuvat, tämä päivitetään.
>
> **Pari-dokumentti:** `backlog.md` kuvaa tietoisesti ulos-scopatut asiat — luetaan rinnan kun suunnitellaan uutta.

---

## 1. Tavoite ja käyttäjäkunta

Henkilökohtainen assistentti-PWA, jonka ydinarvo on aamuisin generoitu LLM-yhteenveto eri tietolähteistä (sähköposti, kalenteri, tehtävät, sää, siitepöly), toimitettuna push-ilmoituksella.

- **Käyttäjäkunta:** ~5 henkilöä (oma perhe ja lähipiiri). Ei skaalaussuunnitelmia laajemmin.
- **Laitteet:** Pääkäyttäjä iPhone, muut Android. PWA toimii molemmilla, vaatii iOSissa "Lisää aloitusnäyttöön" jotta push toimii.
- **Kieli:** Suomi koko sovelluksessa.

---

## 2. Suunnitteluperiaatteet

- **Konservatiiviset teknologiavalinnat** — vakaita kirjastoja ja patternejä, ei kokeellista. Web-skills-pinossa pysyttävä.
- **Budjettiraja** — pilvi- ja LLM-kulut alle 10 €/kk, näkyvyys siihen mihin meneekin.
- **Tietokantapohjainen konfiguraatio** — promptit, mallinvalinnat, asetukset ajetaan kantaan eikä koodiin, jotta muutokset eivät vaadi deploytä. (Huom: tämä on tavoite — kts. backlog kohta mallinvalinnasta.)
- **Jokainen connector on irrotettavissa** — yksittäisen tietolähteen kaatuminen ei kaada yhteenvedon generointia.
- **PWA, ei natiivi** — välttää Apple Developer Program -kustannuksen ja hyödyntää olemassa olevia web-taitoja.

---

## 3. Tekninen pino

| Kerros | Valinta |
|---|---|
| Frontend | React + TypeScript + Vite, Tailwind, shadcn/ui, TanStack Query |
| Hosting (frontend) | Cloudflare Pages |
| Backend | Supabase: Postgres + Edge Functions (Deno) + Auth + pg_cron |
| LLM | Anthropic Claude Haiku 4.5 (kovakoodattu vakio) |
| Push | Web Push (VAPID) |
| PWA-rakennus | `vite-plugin-pwa` (injectManifest) |

---

## 4. Arkkitehtuurin yleiskuva

```
Käyttäjä ──▶ PWA (Cloudflare Pages)
                  │
                  │ Edge Function -kutsut
                  ▼
            Supabase Edge Functions ◀── pg_cron (aamulla, joka 30 min UTC 03–07)
                  │
       ┌──────────┼───────────┬──────────────┐
       ▼          ▼           ▼              ▼
    Google     Todoist     FMI/sptied      Anthropic
    (Gmail+    (REST API)  (sää, siit.)    (Haiku 4.5)
    Calendar)
                  │
                  ▼
            Supabase Postgres
            (asetukset, tokenit, yhteenvedot, muisti)
                  │
                  ▼
            Web Push -palvelu
                  │
                  ▼
                Käyttäjä
```

Aamulla cron herättää `generate-summary`-funktion, joka hakee rinnakkain kaikki konfiguroidut tietolähteet, kasaa promptin, kutsuu Claudea ja lähettää tuloksen push-ilmoituksena.

---

## 5. Tietomalli

Skeema rakennetaan ainoastaan migraatioista (`supabase/migrations/`), ei erillistä `schema.sql`-tiedostoa.

| Taulu | Rooli |
|---|---|
| `user_settings` | Yhteenvetoaika, aikavyöhyke, push-asetukset, kunkin connectorin enable/konfigurointi |
| `google_oauth_tokens` | Salattu Google refresh token, vain service_role |
| `user_integrations` | Muut OAuth-providerit (alkaen Todoistista), salattuna |
| `oauth_states` | Lyhytikäiset OAuth-tilaparametrit CSRF-suojaa varten |
| `daily_summaries` | Generoidut yhteenvedot tekstinä, tokenimäärät, `generated_by` (`llm` \| `template`), viittaukset alkuperäiseen dataan (email/event ID:t) |
| `summary_feedback` | Käyttäjän antama palaute yhteenvedosta + LLM-generoidut muistiehdotukset |
| `user_memory` | Käyttäjäkohtainen muistirakenne kategorioissa: people, preferences, context, feedback |
| `push_subscriptions` | Selainkohtaiset Web Push -tilaukset |
| `prompt_versions` | Promptin versiohistoria (nimi, versio, sisältö, is_active), vain service_role. **Ei** malli-/parametrisarakkeita — malli tulee `user_settings.summary_model`:sta |
| `llm_usage` | Per-kutsu token-käyttö ja arvioitu hinta (input/output/cache-tokenit, `estimated_cost_usd`, `status`, `run_id`), vain service_role |
| `pollen_bulletin` | Siitepölyennustecache (haetaan kerran päivässä cronilla) |

`user_settings` sisältää lisäksi `summary_model` (per-käyttäjä mallinvalinta) ja `is_admin` (fallback-hälytyksen kohdistus).

Kaikilla tauluilla on RLS päällä. Service_role -taulut eivät ole RLS:n läpi luettavissa edes omistajalle — niitä käsitellään vain Edge Functioneista.

**Salaus:** `pgcrypto` (pgsodium ei käytössä). Tokenit salataan kannasta lukiessa ja kirjoittaessa Postgres-funktioilla.

---

## 6. Edge Functions

| Funktio | Rooli |
|---|---|
| `generate-summary` | Cron-laukaistu päivittäinen yhteenveto, orkestroi connectorit + Claude + push |
| `manual-generate-summary` | Sama, mutta käyttäjän JWT:llä "Generoi nyt" -napista |
| `feedback-to-memory` | Generoi muistiehdotuksen palautekommentista |
| `fetch-pollen` | Cron-laukaistu siitepölyennusteen haku ja cachetus |
| `google-oauth-handler` | Google OAuth code → token, salaus, tallennus |
| `todoist-oauth-start` | Todoist OAuth -virran käynnistys (state + redirect) |
| `todoist-oauth-callback` | Todoist OAuth code → access token, tallennus |
| `push-subscribe` / `push-unsubscribe` | Push-tilauksen hallinta |

Jaettu koodi on `supabase/functions/_shared/`-kansiossa: `google.ts`, `anthropic.ts`, `summary.ts`, `crypto.ts`, `push.ts`, `prompts.ts`, `memory.ts`, `holidays.ts`, `types.ts`, `connectors/`.

- `anthropic.ts` — matala API-kerros: mallien allowlist + mallikohtaiset parametrit (`resolveModel`, `requestSummary`), muistiehdotukset.
- `summary.ts` — aamuyhteenvedon orkestrointi: template-fallback, `llm_usage`-logitus + hinnasto, ylläpitäjän fallback-hälytys. Jaettu `generate-summary`- ja `manual-generate-summary`-funktioiden kesken.

**Cron-aikataulutus:** `0,30 3-7 * * *` UTC kattaa Suomen kesä- ja talviajan aamuajat. `trigger_due_summaries` generoi yhden `run_id`:n per ajo ja välittää sen jokaisen käyttäjän `generate-summary`-kutsun bodyssä (→ "yhden aamun kustannus" on yksi `group by run_id` -kysely). `generate-summary` tarkistaa itse onko käyttäjän ajankohta jo ohitettu eikä yhteenvetoa vielä luotu.

---

## 7. Connector-rajapinta

Connectorin tehtävä: hae yhden tietolähteen päivittäinen data käyttäjälle ja palauta se LLM:lle valmiina blokkina.

**Rajapinta** (`_shared/types.ts`):

```
Connector {
  name: string
  isConfiguredFor(userId): Promise<boolean>
  fetch(ctx): Promise<ConnectorOutput>
}
```

**Tämänhetkinen tilanne:** rajapinnasta on käytännössä kaksi sukupolvea:

| Sukupolvi A: noudattaa `Connector`-tyyppiä | Sukupolvi B: irtonainen funktio |
|---|---|
| Gmail (`connectors/gmail.ts`) | Sää (`connectors/weather.ts`) |
| Google Calendar (`connectors/google-calendar.ts`) | Siitepöly (`connectors/pollen.ts`) |
| | Todoist (`connectors/todoist.ts`) |

Sukupolvi B kutsutaan suoraan `generate-summary`:stä erillisinä awaiteina. Tämä on tunnistettu epäjohdonmukaisuus — kts. `backlog.md`.

**Yhteiset toimintaperiaatteet (molemmat sukupolvet):**
- Connectorin kaatuminen ei kaada yhteenvedon generointia — vika hiljaa, osa jää pois.
- Datablokin formaatti LLM:lle on tiivis ihmisluettava teksti, ei raaka JSON, jotta tokeneita säästyy ja prompt-luettavuus säilyy.
- Kausiportit (esim. siitepöly maaliskuu–syyskuu) palauttavat `null` kauden ulkopuolella.

---

## 8. Tietolähteet

| Lähde | Auth | Tila | Huom |
|---|---|---|---|
| Gmail | Google OAuth, scope `gmail.readonly` | Tuotannossa | Lukemattomat ensin, tärkeät mukana |
| Google Calendar | Google OAuth, scope `calendar.readonly` | Tuotannossa | Kaikki kalenterit, päivän tapahtumat |
| Sää (FMI WFS) | Ei avainta | Tuotannossa | HARMONIE-malli, lämpö/sade/tuuli/symboli |
| Siitepöly | Ei avainta | Tuotannossa | sptied.fi, kauden ulkopuolella null |
| Todoist | OAuth, scope `data:read` | Tuotannossa | Tänään/myöhässä/tulossa p≥3 7 vrk |

**Sää ja siitepöly** ovat asetuksissa per-käyttäjä päälle/pois -kytkettäviä. **Todoist** kytkeytyy yhdistämisen kautta. **Gmail ja Calendar** ovat aina päällä kun Google on yhdistetty.

---

## 9. Promptien hallinta

`prompt_versions`-taulu pitää promptin **sisällön** kannassa (nimi, versio, is_active). Partial unique index + trigger varmistaa että yhdellä prompt-nimellä on aina täsmälleen yksi aktiivinen versio. Taulussa **ei** ole malli-/parametrisarakkeita — malli valitaan erikseen `user_settings.summary_model`:sta.

**Nykyiset promptit:**
- `daily_summary_system` — neljä versiota (v1 perusta, v2 sää, v3 siitepöly, v4 Todoist). Aktiivinen: v4.
- `feedback_to_memory` — muistiehdotusten generointi palautteesta.

**Mallinvalinta:** kts. §13.

---

## 10. Käyttäjäkohtainen muisti

Muistirakenne (`user_memory`) toimii tehtynä kontekstina LLM-promptissa. Sisältää kategorioita: `people`, `preferences`, `context`, `feedback`.

Muistin täyttämiseen on suunniteltu kolme polkua:

| Polku | Mistä syntyy | Tila |
|---|---|---|
| A — profiililomake | SettingsPage → "Tunne minut paremmin" -lomake | Tuotannossa |
| B — palautteesta yleistys | Yhteenvedon palaute → LLM ehdottaa muistia → käyttäjä hyväksyy | Tuotannossa |
| C — "Muista tämä" -nappi | HomePage/SummaryDetailPage napilla yksittäisen yhteenvetokohdan tallennus | Ei toteutettu |

---

## 11. Frontend

**Reitit** (kaikki toteutettu): `/login`, `/auth/callback`, `/` (HomePage), `/history`, `/summary/:date`, `/settings`, `/connect-google`, `/connect-todoist`.

**SettingsPage on jaettu kuuteen osioon:**
1. Aamuyhteenveto (aika, aikavyöhyke, "Generoi nyt", push)
2. Tunne minut paremmin (muistipolku A)
3. Muistiinpanot (suora muokkaus muistilistaan)
4. Yhteydet (Google, Todoist; per-connector enable-kytkimet)
5. Käyttö ja kustannukset (token/€-näkymä, konditionaalinen)
6. Tili (sähköposti, uloskirjautuminen)

---

## 12. Push-notifikaatiot

- Service Worker (`src/sw-custom.ts`) käsittelee `push`- ja `notificationclick`-tapahtumat.
- Kaksi laukaisukohtaa: (1) onnistunut yhteenveto (teaser-teksti), (2) Google-token vanhentunut → uudelleenkirjautumiskehotus.
- iOSissa toimii vain "Lisää aloitusnäyttöön" -jälkeen.

---

## 13. Modelin ja prompttien vaihto

- **Promptien sisältö** vaihdetaan SQL-päivityksellä (`prompt_versions`-tauluun uusi versio aktiiviseksi).
- **Mallin vaihto** tapahtuu `user_settings.summary_model`:a muuttamalla (per-käyttäjä; SettingsPagen dropdown tai suora SQL). Ei deployta.

**Allowlist (`_shared/anthropic.ts`):** `summary_model`-arvo validoidaan eksplisiittistä allowlistia vasten. Tuntematon / null / tyhjä arvo → oletus `claude-haiku-4-5-20251001` + `console.warn` (ei kaadeta). Hyväksytyt arvot ja niiden pinnatut API-ID:t:

| `summary_model` | API-malli | Parametrit |
|---|---|---|
| `claude-haiku-4-5` / `claude-haiku-4-5-20251001` (oletus) | `claude-haiku-4-5-20251001` | `temperature: 0.7`, max_tokens 1024 |
| `claude-sonnet-4-6` | `claude-sonnet-4-6` | `effort: low`, ei temperaturea, max_tokens 2048 |
| `claude-sonnet-5` | `claude-sonnet-5` | `effort: low`, ei temperaturea, max_tokens 2048 |

**Mallikohtaiset parametrit — miksi:** Sonnet 5 hylkää ei-default samplausparametrit (`temperature`/`top_p`/`top_k`) 400-virheellä, joten temperature jätetään pois Sonnet-malleilta. `effort: low` pitää lyhyen generointitehtävän halpana (Sonnet 5:llä adaptive thinking on oletuksena päällä). Haiku 4.5 ei tue effort- eikä adaptive-thinking-parametreja, joten niitä ei aseteta sille.

**Fallback ja logitus:** jokainen LLM-kutsu kirjoittaa `llm_usage`-rivin (tokenit + arvioitu hinta Helsinki-ajan hinnaston mukaan). Jos LLM-kutsu epäonnistuu mistä tahansa syystä, `generateSummaryOrTemplate` palaa deterministiseen templateen (`generated_by = 'template'`), kirjaa `status = 'fallback'` ja lähettää Web Push -hälytyksen vain ylläpitäjälle (`is_admin = true`). Raportti toimitetaan aina.

> **ID-varmistus:** allowlistin ID:t on todennettu Anthropicin mallikatalogia vasten. Halutessa ne voi varmistaa ajonaikaisesti kertaluontoisesti: `curl https://api.anthropic.com/v1/models -H "x-api-key: $ANTHROPIC_API_KEY" -H "anthropic-version: 2023-06-01"` ja verrata allowlistiin. Tätä **ei** ole tuotantopolussa.

Haiku 4.5 on todettu riittäväksi nykyisille käyttötapauksille. Sonnetiin siirtyminen on yhden koodimuutoksen päässä (jatkossa SQL-päivityksen päässä).
