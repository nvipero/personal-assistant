# Nykytila-kartoitus

> Tuotettu 2026-05-29. Tarkoitettu pohjana architecture.md-dokumentin kirjoittamiseen.

---

## 1. Tietokantaskeema

Skeema rakennetaan kokonaan 15 migraatiotiedoston kautta (`supabase/migrations/`), erillistä `schema.sql`-tiedostoa ei ole.

### Taulut (`public`-skeema)

| Taulu | Tarkoitus | RLS | Lisätty alkuperäisen jälkeen |
|---|---|---|---|
| `user_settings` | Käyttäjäkohtaiset asetukset: yhteenvetoaika, aikavyöhyke, push-asetukset, Google-sähköposti | kyllä | Kyllä: `push_enabled`, `needs_google_reauth`, `weather_enabled`, `weather_place`, `google_email` |
| `google_oauth_tokens` | Salattu Google refresh token — vain service_role pääsy | kyllä | Ei |
| `daily_summaries` | Generoidut aamuyhteenvedot tekstinä, tokenimäärät, viittaukset sähköposti/kalteri-ID:ihin | kyllä | Ei |
| `push_subscriptions` | Selainkohtaiset Web Push -tilaukset (endpoint, p256dh, auth) | kyllä | Ei |
| `prompt_versions` | Järjestelmäpromptin versiohistoria — vain service_role pääsy | kyllä | Ei |
| `user_memory` | Käyttäjäkohtainen muistirakenne kategorioilla: people, preferences, context, feedback | kyllä | Ei |
| `summary_feedback` | Käyttäjän antama palaute yhteenvedoista: arvio, kommentti, muistiehdotus, hyväksyntätila | kyllä | Ei |
| `pollen_bulletin` | Siitepölyennuste-cache (haetaan päivittäin ulkoisesta lähteestä) | kyllä | Kyllä (kokonaan uusi) |
| `user_integrations` | Kolmansien osapuolien OAuth-tokenit salattuna (esim. Todoist) | kyllä | Kyllä (kokonaan uusi) |
| `oauth_states` | Lyhytikäiset OAuth-tilaparametrit CSRF-suojaukseen — vain service_role | kyllä | Kyllä (kokonaan uusi) |

### Postgres-laajennukset

- **pgcrypto** — tokenien salaus/purku
- **pg_cron** — ajastetut Edge Function -kutsut
- **pg_net** — HTTP-kutsut Edge Functioneista

pgsodium ei ole käytössä.

---

## 2. Edge Functions

| Funktio | Tarkoitus | Käynnistys | Tila |
|---|---|---|---|
| `generate-summary` | Generoi päivittäisen aamuyhteenvedon kaikista connectoreista, lähettää push-ilmoituksen | Cron: `0,30 3-7 * * *` UTC | Tuotannossa |
| `manual-generate-summary` | Sama kuin yllä, mutta käyttäjän JWT:llä — "Generoi nyt" -nappi asetuksista | Frontend | Tuotannossa |
| `feedback-to-memory` | Generoi muistiehdotuksen palautekommentista Claudella | Frontend | Tuotannossa |
| `fetch-pollen` | Hakee siitepölyennusteen sptied.fi:stä, tallentaa `pollen_bulletin`-tauluun | Cron: `30 3 * * *` UTC | Tuotannossa |
| `google-oauth-handler` | Vaihtaa Google OAuth -koodin tokeneiksi, tallentaa salatun refresh tokenin | Frontend (OAuth callback) | Tuotannossa |
| `todoist-oauth-start` | Käynnistää Todoist OAuth -virran, tallentaa state `oauth_states`-tauluun | Frontend | Tuotannossa |
| `todoist-oauth-callback` | Vaihtaa Todoist OAuth -koodin access tokeniksi, tallentaa `user_integrations`-tauluun | Frontend (OAuth callback) | Tuotannossa |
| `push-subscribe` | Tallentaa selaimen push-tilauksen | Frontend | Tuotannossa |
| `push-unsubscribe` | Poistaa push-tilauksen | Frontend | Tuotannossa |

---

## 3. Connector-rajapinta

**Tiedosto:** `supabase/functions/_shared/types.ts`

Rajapinta on `Connector`-tyyppi:

```
Connector {
  name: string
  isConfiguredFor(userId: string): Promise<boolean>
  fetch(ctx: ConnectorContext): Promise<ConnectorOutput>
}

ConnectorContext { userId, timezone, date, userEmail, accessToken }
ConnectorOutput  { source: string, items: ConnectorItem[] }
ConnectorItem    { id, type, promptText, meta }
```

Tämän lisäksi on kaksi irtonaisempaa funktiota (`fetchWeather`, `fetchTodoistTasks`, `fetchPollenForDate`) jotka eivät noudata `Connector`-rajapintaa vaan kutsutaan suoraan `generate-summary`-funktiosta.

### Toteutetut connectorit

| Nimi | Tiedosto | Käyttää Connector-tyyppiä | Tila |
|---|---|---|---|
| Gmail | `connectors/gmail.ts` | Kyllä | Tuotannossa |
| Google Calendar | `connectors/google-calendar.ts` | Kyllä | Tuotannossa |
| FMI Sää | `connectors/weather.ts` | Ei (erillinen funktio) | Tuotannossa |
| Siitepöly | `connectors/pollen.ts` | Ei (erillinen funktio) | Tuotannossa |
| Todoist | `connectors/todoist.ts` | Ei (erillinen funktio) | Tuotannossa |

`weatherSymbols.ts` on apumoduuli, ei oma connector.

**Rajapinnan yhtenäisyys:** Gmail ja Calendar noudattavat `Connector`-tyyppiä. Sää, siitepöly ja Todoist on lisätty myöhemmin ilman samaa rajapintaa — ne kutsutaan suoraan `generate-summary`-funktiosta erillisinä awaiteina.

---

## 4. Käyttäjäkohtainen muistirakenne

### Polku A: profiililomake (`SettingsPage` → "Tunne minut paremmin")
**Toteutettu.** Lomake kolmella vapaatekstikentällä (tärkeimmät henkilöt, preferenssit, konteksti). Tallennus `user_memory`-tauluun hookilla `useSaveProfile`. Toimii täysimääräisesti.

### Polku B: palautteesta yleistys (FeedbackButtons → `feedback-to-memory` → ehdotusmodaali)
**Toteutettu.** `FeedbackSection`-komponentti lähettää palautekommentin `feedback-to-memory`-funktioon, joka palauttaa tekstiehdotuksen + kategorian. Käyttäjä voi muokata tekstiä ja hyväksyä (`useAcceptMemorySuggestion`) tai hylätä ehdotuksen.

### Polku C: "Muista tämä" -nappi (`HomePage` / `SummaryDetailPage`)
**Ei toteutettu.** Kummassakaan sivussa ei ole "Muista tämä" -toimintoa. Tämä polku puuttuu kokonaan.

---

## 5. Frontend

### Reitit (`src/routes/`)

| Reitti | Tiedosto | Tila |
|---|---|---|
| `/login` | `LoginPage.tsx` | Toteutettu |
| `/auth/callback` | `AuthCallbackPage.tsx` | Toteutettu |
| `/` | `HomePage.tsx` | Toteutettu |
| `/history` | `HistoryPage.tsx` | Toteutettu |
| `/summary/:date` | `SummaryDetailPage.tsx` | Toteutettu |
| `/settings` | `SettingsPage.tsx` | Toteutettu |
| `/connect-google` | `ConnectGooglePage.tsx` | Toteutettu |
| `/connect-todoist` | `ConnectTodoistPage.tsx` | Toteutettu |

Kaikki suunnitellut sivut on toteutettu. Todoist-integrointisivu on lisätty alkuperäisen suunnitelman ulkopuolelta.

### SettingsPage-osiot

| Osio | Tila |
|---|---|
| 1. Aamuyhteenveto (aika, aikavyöhyke, "Generoi nyt", push-ilmoitukset) | Toiminnassa |
| 2. Tunne minut paremmin (profiililomake) | Toiminnassa |
| 3. Muistiinpanot (muistilista, lisäys/muokkaus/poisto) | Toiminnassa |
| 4. Yhteydet (Google, Todoist) | Toiminnassa |
| 5. Käyttö ja kustannukset (tokenimäärät, arvioitu kustannus kuukauden ja edellisen kuun osalta) | Toiminnassa — konditionaalisesti renderöity (`costStats`-datan perusteella) |
| 6. Tili (sähköposti, uloskirjautuminen) | Toiminnassa |

---

## 6. Promptien hallinta

`prompt_versions`-taulu on käytössä. Neljä versiota, kaikki nimellä `daily_summary_system`:

| Versio | Lisäys | Mitä toi |
|---|---|---|
| v1 | Alkuperäinen seed | Perusrakenne, sävy, few-shot-esimerkit (3 kpl) |
| v2 | `prompt_v2_weather` | Sääosuuden käsittely (lämpötila, sade, tuuli) |
| v3 | `prompt_v3_pollen` | Siitepölyosuuden käsittely, antihistamiinimuistutus |
| v4 | `prompt_v4_todoist` | Todoist-tehtäväosuuden käsittely (tänään / myöhässä / tulossa) |

Aktiivinen versio: **v4** (viimeisin).

`prompt_versions`-taulussa on `model`-sarake, mutta se ei ohjaa mallin valintaa käytännössä — malli on kovakoodattu `_shared/anthropic.ts`-tiedostossa vakioksi **`claude-haiku-4-5`**.

---

## 7. Connectorien tila yksityiskohtaisesti

**Gmail** — Tuotannossa. Hakee lukemattomat ja tärkeät viestit, järjestää lukemattomat ensin.

**Google Calendar** — Tuotannossa. Hakee kaikki käyttäjän kalenterit ja kyseisen päivän tapahtumat.

**Sää (FMI)** — Tuotannossa. Käyttää FMI:n WFS OpenData -rajapintaa (`fmi::forecast::harmonie::surface::point::timevaluepair`). Palauttaa lämpötilat (9:00, 17:00, min, max), sadeajankohdat ja tuulen (vain jos ≥7 m/s) sekä säätilan symbolikoodin.

**Siitepöly** — Tuotannossa. `fetch-pollen`-funktio hakee ennustteen sptied.fi:stä cron-ajona klo 03:30 UTC ja tallentaa `pollen_bulletin`-tauluun. `pollen.ts`-connector lukee cachesta. Kausi on maaliskuu–syyskuu, muulloin connector palauttaa `null`.

**Todoist** — Tuotannossa. Hakee tehtävät REST v2 -rajapinnasta, luokittelee ne (tänään / myöhässä / tulossa 7 vrk, prioriteetti ≥3). Tunnistaa revokoidun tokenin (401) ja merkitsee integraation epäaktiiviseksi.

---

## 8. Push-notifikaatiot

- **Service Worker rekisteröity:** Kyllä — `src/sw-custom.ts`, rakennetaan `vite-plugin-pwa`:lla (injectManifest-strategia). Käsittelee `push`- ja `notificationclick`-tapahtumat.
- **`push-subscribe` ja `push-unsubscribe`:** Kyllä, molemmat toiminnassa.
- **Frontend-tuki:** `src/lib/pushNotifications.ts` — `subscribeToPush`, `unsubscribeFromPush`, `getCurrentSubscription`, `isPushSupported`, `isRunningAsStandalone`.
- **Testattu oikealla laitteella:** Epäselvä, vaatii selvitystä.

Push-ilmoituksia lähetetään kahdesta kohtaa: onnistuneen yhteenvedon valmistuttua (teaser-teksti) sekä silloin kun Google-token on vanhentunut ja uudelleenkirjautuminen tarvitaan.

---

## 9. Tiedostetut keskeneräiset asiat

Koodikannassa ei ole yhtään TODO- tai FIXME-kommenttia. Seuraavat asiat ovat rakenteellisesti puutteellisia tai avoimia:

1. **Muistirakenne polku C puuttuu** — "Muista tämä" -nappi ei ole toteutettu `HomePage`- tai `SummaryDetailPage`-sivuilla.
2. **`prompt_versions.model`-sarake ei ohjaa mallinvalintaa** — malli on kovakoodattu `anthropic.ts`:ssä; sarakkeen data on metadataa ilman toiminnallista vaikutusta.
3. **Connectorit eivät noudata yhtenäistä `Connector`-rajapintaa** — Gmail ja Calendar käyttävät `Connector`-tyyppiä, mutta sää, siitepöly ja Todoist kutsutaan suoraan irrallisina funktioina.
4. **Kustannusosio konditionaalinen** — `SettingsPage`:n kustannusnäkymä ei renderöidy jos `costStats` on tyhjä (ei virheviestiä eikä placeholderia).
5. **Push-notifikaatioiden toimivuutta ei ole vahvistettu oikealla laitteella.**
6. **`oauth_states`-taulun vanhenemistenpuhdistus** — tauluun ei ole automaattista siivousta vanhentuneille tiloille.

---

## 10. Poikkeamat alkuperäisestä briiffistä

Alkuperäistä brieffiä (`02-claude-code-briefi_2.md`) ei löydy repositoriosta, joten vertailu perustuu migraatiohistoriaan ja rakenteen kehitykseen.

| Muutos | Kuvaus |
|---|---|
| **Todoist-integraatio lisätty** | `user_integrations`- ja `oauth_states`-taulut, kaksi OAuth Edge Functionia (`todoist-oauth-start`, `todoist-oauth-callback`) ja `ConnectTodoistPage` — kokonaisuudessaan lisätty alkuperäisen briiffin jälkeen migraatioissa 14–15. |
| **Siitepölydata tallennetaan kantaan** | Siitepöly ei kulje suoraan connectoreista promptiin, vaan `fetch-pollen` tallentaa päivittäin välimuistiin `pollen_bulletin`-tauluun ja connector lukee sieltä. Arkkitehtuuriltaan erilainen kuin sää- tai sähköposticonnectorit. |
| **Sää- ja push-asetukset `user_settings`-tauluun** | `weather_enabled`, `weather_place`, `push_enabled`, `needs_google_reauth`, `google_email` lisätty erillisillä migraatioilla alkuperäisen skeeman päälle. |
| **`manual-generate-summary` eriytetty omaksi funktioksi** | Käyttäjän käynnistämä generointi on oma Edge Function eikä parametriohjattu polku `generate-summary`-funktiossa. Palauttaa myös `summary_text`-kentän esikatseltavaksi. |
| **Connectorit eivät kata koko `Connector`-rajapintaa** | Alkuperäisessä rajapintasuunnitelmassa kaikki connectorit seuraavat `Connector`-tyyppiä. Käytännössä sää, siitepöly ja Todoist lisättiin irtonaisina funktioina. |
| **`prompt_versions`-taulu kasvoi 4 versioon** | Prompt on päivitetty neljä kertaa sitä mukaa kun uusia connectoreita lisättiin. |
