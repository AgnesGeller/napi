# Díszkertek – Napi feladatok

Mobil-first, telepíthető webalkalmazás a napi munkák összeállításához, heti és havi áttekintéséhez, PDF-mentéséhez és eszközök közötti szinkronizálásához.

## Használat

Az alkalmazás címe: <https://agnesgeller.github.io/napi/>

- A **Napi nézetben** készül az adott nap terve.
- A **Heti nézet** péntektől csütörtökig mutatja a munkákat.
- A **Havi nézetben** a napi tervek és az előjegyzések is láthatók.
- A mentett tervek a csatlakoztatott PC-k és Android-telefonok között automatikusan szinkronizálódnak.
- Az **Adatok kezelése → Autók** részen az autók neve és megkülönböztető színe is módosítható; ez a szín a napi terven és a PDF-en is megjelenik.
- A PDF, a heti, havi és éves napi feladatok, valamint az alkalmazás a **Letöltések** ablakból érhető el.

## Telefonos értesítések

Az értesítés a **Felmérés** és **Megbeszélés** típusú előjegyzésekhez használható. Nem SMS, ezért nincs üzenetküldési díja, és Firebase-regisztráció sem szükséges.

1. Nyisd meg a felmérést vagy megbeszélést.
2. A **Telefonos emlékeztető** résznél adj hozzá egy vagy több időpontot.
3. Mentsd az előjegyzést.
4. Minden értesítést fogadó Android-telefonon egyszer nyomd meg a fejlécben az **Értesítések** gombot, majd az **Értesítések bekapcsolása** gombot.
5. Engedélyezd az értesítéseket a böngésző kérdésénél.

Minden engedélyezett telefon ugyanazt az értesítést kapja. Egy telefon a **Kikapcsolás ezen a telefonon** gombbal leválasztható. A csipogás és rezgés erősségét az Android rendszer értesítési beállításai szabályozzák. Az értesítéshez internetkapcsolat kell; a bezárt telepített alkalmazás mellett is megérkezhet.

## Technikai felépítés

- Statikus HTML5, CSS3 és vanilla JavaScript; nincs frontend framework.
- Telepíthető PWA service workerrel és offline gyorsítótárral.
- A napi tervek közös szinkronja a meglévő, kizárólag ehhez az alkalmazáshoz tartozó `napi_*` Supabase-táblákat használja.
- A Web Push feliratkozások a `napi_push_subscriptions`, az elküldésre váró emlékeztetők a `napi_notification_reminders` táblában vannak.
- A táblákon RLS aktív; a bejelentkezett felhasználó csak a saját rekordjait kezelheti.
- A VAPID privát kulcs a Supabase Vaultban van, nem kerül a böngészőbe vagy a repositoryba.
- A `napi-send-reminders` Edge Function küldi ki az esedékes értesítéseket. A Supabase Cron percenként indítja.
- Az elküldött értesítési sorok 30 nap után automatikusan törlődnek, így a tárhelyhasználat alacsony marad.
- A Kassza és a Munkalap tábláihoz, fájljaihoz és működéséhez ez a funkció nem nyúl.

## Supabase-üzemeltetés

Az adatbázis-leírás: `supabase/migrations/20260928130000_napi_push_notifications.sql`.

Az Edge Function forrása: `supabase/functions/napi-send-reminders/index.ts`.

A Vault- és cron-beállítás biztonságos, kitöltendő mintája: `supabase/cron.example.sql`.

A felhőben szükséges Vault-nevek:

- `napi_vapid_public_key`
- `napi_vapid_private_key`
- `napi_project_url`
- `napi_legacy_anon_key`

A kulcsértékeket tilos a repositoryba vagy frontendkódba írni. A cron feladat neve `napi-send-push-reminders`, ütemezése percenkénti. A funkció JWT-ellenőrzéssel fut; az adatbázis-műveletekhez a Supabase által biztosított szerveroldali service role környezetet használja.

## Ellenőrzési lista

- Android Chrome-ban az app telepíthető, az értesítési engedély külön bekapcsolható.
- Felméréshez és megbeszéléshez több, egymástól eltérő időpont adható és törölhető.
- Munka típushoz nem készül értesítés.
- Módosításkor a régi, még el nem küldött időpontok lecserélődnek.
- Előjegyzés vagy teljes nap törlésekor a hozzá tartozó várakozó értesítések is törlődnek.
- Az értesítés megnyitása a megfelelő napra visz.
- Lejárt böngésző-feliratkozás automatikusan kikapcsolódik.

## Helyi ellenőrzés

A projekt külső build-függőség nélkül fut. JavaScript szintaxisellenőrzés:

```powershell
node --check js/app.js
node --check js/napi-sync.js
node --check sw.js
```

A regressziós tesztek a `tests` mappában vannak. Windows alatt a következő paranccsal futtathatók:

```powershell
node --test tests/deletion-sync.test.cjs tests/print-layout.test.cjs tests/push-notifications.test.cjs tests/sync-session.test.cjs tests/vehicle-colors.test.cjs
```
