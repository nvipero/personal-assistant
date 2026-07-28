# Backlog

> **Tarkoitus:** Tietoisesti scope-ulottuvat asiat ja tunnistettu tekninen velka. Tämä on suunnittelutyökalu — kun aloitetaan uusi feature, luetaan rinnan `architecture.md`:n kanssa ja tarkistetaan: mikä näistä kannattaisi tehdä saman tien?
>
> **Mitä tämä EI ole:** ei kaikenkattava feature-toivelista, ei priorisoitu roadmap. Tähän pääsee asia kun se on (a) tietoisesti jätetty ulos jostain päätöksestä, tai (b) tunnistettu rakenteellinen vajaavaisuus joka tulee korjattavaksi jossain vaiheessa.
>
> **Pari-dokumentti:** `architecture.md` kuvaa nykytilan.

---

## Rakenne

Jokaisesta backlog-kohdasta:
- **Mitä** — yhden virkkeen kuvaus
- **Miksi ulkona** — syy joka selittää scope-päätöksen
- **Mihin liittyy** — minkä uudemman suunnittelun kanssa kannattaa ottaa kantaa, tai mikä signaali laukaisee tämän työn

---

## Tekninen velka

### 1. Connector-rajapinnan yhtenäistäminen

- **Mitä:** Sää, siitepöly ja Todoist eivät noudata `Connector`-rajapintaa, vaan ne kutsutaan irrallisina funktioina `generate-summary`:stä. Refaktoroitava sukupolveen A samalla tavalla kuin Gmail ja Calendar.
- **Miksi ulkona:** Connectorit on lisätty iteratiivisesti, ja jokaisella kerralla on edetty nopeasti toiminnallisuus edellä.
- **Mihin liittyy:** Kun lisätään seuraavaa connectoria (esim. uutiset), tämä kannattaa korjata samalla — muuten sukupolvi B kasvaa ja `generate-summary`-funktiosta tulee yhä monimutkaisempi. Liittyy myös: jos halutaan tehdä connector-tason testaus tai kustannusseuranta per-source, yhtenäinen rajapinta on edellytys.

### 2. Mallinvalinta kantaan — ✅ RATKAISTU

- **Mitä oli:** malli oli kovakoodattu `_shared/anthropic.ts`:ssä; oletus että `prompt_versions.model` ohjaisi sitä (saraketta ei tosiasiassa ollut).
- **Ratkaisu:** malli tulee `user_settings.summary_model`:sta (per-käyttäjä, SettingsPagen dropdown), validoituna allowlistia vasten `_shared/anthropic.ts`:ssä. Mallikohtaiset parametrit (temperature/effort) käsitellään mallikohtaisesti. Mallin vaihto ei vaadi deployta. Kts. `architecture.md` §13.
- **Jäljellä:** jos joskus halutaan eri malli `feedback_to_memory`-promptille (nyt kiinteä Haiku `anthropic.ts`:ssä), sama allowlist-mekanismi laajenee sinne.

### 2b. Prompt caching Sonnet-malleilla

- **Mitä:** Jos aamupromptin todellinen token-koko (nyt mitattavissa `llm_usage.input_tokens`-kentästä) ylittää 1 024 tokenia, prompt caching muuttuu Sonnet-malleilla kannattavaksi (Sonnetin välimuistiminimi 1 024, Haiku 4.5:n 4 096). Stabiili prefiksi (system-prompt + few-shot) on ehdokas välimuistiin.
- **Miksi ulkona:** Tietoisesti scopattu ulos mallinvaihto-brieffistä. Kannattavuus riippuu promptin koosta, joka pitää ensin mitata `llm_usage`-datasta.
- **Mihin liittyy:** Aktivoituu jos siirrytään Sonnet-malliin pysyvästi ja `llm_usage` osoittaa prefiksin olevan > 1 024 tokenia. Toteutus: `cache_control`-breakpoint stabiilin prefiksin loppuun `_shared/anthropic.ts`:ssä.

### 3. `oauth_states`-taulun siivous

- **Mitä:** Vanhentuneille OAuth state -riveille ei ole automaattista siivousta.
- **Miksi ulkona:** Taulu kasvaa hitaasti (~5 käyttäjää × yhdistämiset), ei aiheuta ongelmaa lähitulevaisuudessa.
- **Mihin liittyy:** Kun lisätään uusia OAuth-providereita (kts. uudet tietolähteet alla), kasvunopeus moninkertaistuu. Lisätään pg_cron-task joka pyyhkii > 10 min vanhat rivit.

### 4. Kustannusosion fallback

- **Mitä:** SettingsPagen "Käyttö ja kustannukset" -osio ei renderöidy lainkaan jos `costStats` on tyhjä. Ei placeholderia eikä virheviestiä.
- **Miksi ulkona:** Reunatapaus, ei haitannut ensimmäistä käyttöönottoa.
- **Mihin liittyy:** Uusi käyttäjä ei näe osiota lainkaan ennen ensimmäistä yhteenvetoa, mikä on hämmentävää. Pieni UX-paranne joka kannattaa tehdä jos SettingsPage muuten avataan muokkaukseen.

### 5. Push-notifikaatioiden vahvistustestaus

- **Mitä:** Push-notifikaatioiden todellista toimivuutta oikealla laitteella ei ole järjestelmällisesti vahvistettu.
- **Miksi ulkona:** Toiminta on kohtuullisesti varmistettu kehityksessä; lopullinen end-to-end-testi vaatii oikean iPhone/Android-laitteen ja päiväyhden välistä viivettä.
- **Mihin liittyy:** Aina kun push-flowiin koskee (Service Worker, VAPID, payload-rakenne), tämä testi pitäisi ajaa uudestaan. Kannattaa kirjata muistilista mitä testataan ja missä järjestyksessä.

---

## Ei vielä toteutetut suunnitelmat

### 6. "Muista tämä" -nappi (muistipolku C)

- **Mitä:** HomePagelle ja/tai SummaryDetailPagelle nappi jolla yksittäisen yhteenvetokohdan voi tallentaa muistiin nopeasti, ilman erillistä lomaketta.
- **Miksi ulkona:** Polut A (lomake) ja B (palaute) kattavat 80 % käyttötapauksista. C on käyttömukavuutta lisäävä, ei kriittinen.
- **Mihin liittyy:** Kun yhteenvetonäkymälle tehdään muuten muutoksia (esim. uusi datavisualisointi tai action-painikkeet), kannattaa lisätä tämä samalla. Vaatii UX-päätöksen: avautuuko muokattava modaali vai tallennetaanko suoraan?

### 7. Kirjoitusoperaatiot (Todoist, Gmail, Calendar)

- **Mitä:** Sovellus voi luoda tehtäviä Todoistiin, sähköpostiluonnoksia Gmailiin ja kalenteritapahtumia Google Calendariin LLM:n ehdotuksen pohjalta. Vaatii käyttäjän vahvistuksen ennen suoritusta.
- **Miksi ulkona:** Iso UX- ja luotettavuuskysymys. Lukuvaiheen pitää olla vakaa ennen kuin lisätään kirjoitustoiminnot, joissa virhe on käyttäjälle kalliimpi (lähetetty väärä viesti, väärä kalenterivaraus).
- **Mihin liittyy:** Aktivoituu kun (a) lukupuoli on stabiili pidemmän aikaa, ja (b) on selkeä käyttötapaus joka motivoi sen. Esim. "tämän sähköpostin perusteella ehdotan tehtävää" -flow on selvin kandidaatti aloitukseen. Vaatii scope-laajennuksen Todoistissa (`data:read_write`) ja Googlessa (`gmail.compose`, `calendar.events`).

### 8. Chat-jatkokysymykset yhteenvedosta

- **Mitä:** Käyttäjä voi kysyä yhteenvedon perään tarkennuksia ("avaa Matin meili tarkemmin", "mitä tuo palaveri oikeasti koskee").
- **Miksi ulkona:** Vaatii uutta UI:ta (chat-näkymä), tool-use-rakenteen LLM-kutsuihin, ja keskusteluhistorian taulurakenteen.
- **Mihin liittyy:** MVP:ssä on rakennettu valmiiksi: `daily_summaries.email_ids` ja `event_ids` säilyttävät viittaukset alkuperäisiin Google-objekteihin, joten chat voi haetaa ne uudestaan Googlesta ID:n perusteella ilman että sisältö tallentuu pysyvästi. Kun aktivoidaan, perustyö on osin jo tehty.

### 9. Käyttäjäkohtaiset rutiiniasetukset (esim. Todoist)

- **Mitä:** SettingsPagelle osio jossa voi merkitä esim. projekti "Rutiinit" = älä koskaan mainitse yhteenvedossa, tai label `@päivittäinen` = käsittele rutiinina.
- **Miksi ulkona:** LLM:n päättely promptin ohjeesta riittää MVP:ssä; oletetaan että käyttäjäkohtaisuus ei ole välttämätöntä.
- **Mihin liittyy:** Jos käyttäjäpalaute toistuvasti osoittaa että LLM käsittelee jonkun käyttäjän rutiineja väärin, tämä on luonteva ensimmäinen vastaus. Suunniteltava niin että sama mekanismi toimii myös muille connectoreille (esim. sähköpostin osalta "tämä lähettäjä = älä nosta esiin").

### 10. Aikaestimaatti-feature tehtäville

- **Mitä:** Käyttäjä voi merkitä Todoist-tehtävälle aikaestimaatin (esim. labeliin `@30min`, `@2h`), ja LLM käyttää sitä päivän realistisuusarviossa.
- **Miksi ulkona:** Todoist ei tue aikaestimaatteja natiivisti. LLM tekee karkean arvion sisällöstä, mikä riittää useimmiten.
- **Mihin liittyy:** Aktivoituu jos LLM:n karkea arvio osoittautuu järjestelmällisesti epäluotettavaksi käyttöpalautteen perusteella.

### 12. Uudet tietolähteet (uutiset, jne.)

- **Mitä:** Uusia connectoreita aamuyhteenvetoon — uutiset on aiemmin mainittu kandidaattina, muita voi tulla.
- **Miksi ulkona:** Iteratiivinen lisäys, jokainen vaatii oman suunnittelunsa.
- **Mihin liittyy:** Jokainen uusi connector pitää suunnitella erikseen ja toteuttaa connector-rajapinnan kautta (kts. tekninen velka kohta 1 — yhtenäistäminen kannattaa hoitaa viimeistään seuraavan connectorin yhteydessä). Suunnitteluun käytetään sapluunana olemassa olevia connector-suunnitelmia.
