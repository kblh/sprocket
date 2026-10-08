# Sprocket Rocket – simulace analogového fotoaparátu

Datum: 2026-10-07
Stav: ke schválení

## 1. Cíl

Webová aplikace (vanilla JS + HTML + CSS, bez frameworků a build kroku), která simuluje panoramatický 35mm foťák Lomography Sprocket Rocket. Uživatel fotí živou webkamerou (primárně telefonem) a získá černobílý snímek ve stylu filmu **Kodak Tri-X 400**. Snímek je panoramatický a přesahuje přes perforaci filmu. Hotový snímek lze uložit na telefon.

## 2. Rozsah

### V rozsahu
- Živý náhled z kamery v panoramatickém rámečku (poměr 2,2:1 podle referenčního snímku 2860×1302) s perforací a okraji filmu.
- Přepnutí zadní a přední kamery.
- Přepínač orientace filmu: na šířku (pás 2,2:1) nebo na výšku (svislý pás 1:2,2 s perforací po stranách). Volba se pamatuje.
- Co nejvyšší rozlišení z kamery (žádost o 4096×3072, snímek nejvýše 3600 px na delší straně) a nejširší dostupný záběr: zadní ultraširoká kamera, případně zoom pod 1×.
- Volné focení: spoušť okamžitě vytvoří jeden hotový snímek. Žádné počítadlo a žádné přetáčení filmu.
- Jediný film: Kodak Tri-X 400, černobílý (bez výběru filmů).
- Uložení snímku: Web Share API se souborem (na telefonu „Uložit obrázek“ do Fotek), fallback na stažení souboru.
- Jednoduchá galerie uložených snímků (IndexedDB).
- Spoušť s krátkým bílým zábleskem a cvaknutím (WebAudio).

### Mimo rozsah
Další filmy, nahrávání souborů, dvojitá expozice, nastavení efektů, počítadlo snímků, ruční ostření.

## 3. Prostředí a omezení

- Kamera (`getUserMedia`) vyžaduje **HTTPS** nebo `localhost`.
- Webová stránka nemůže zapisovat přímo do Fotek. Nejbližší cesta je `navigator.share({files})`, případně stažení souboru.
- Cíl: aktuální Safari (iOS), Chrome (Android, desktop). Bez WebGL.
- Aplikace se spouští z jednoduchého statického serveru (např. `python3 -m http.server`).

## 4. Struktura souborů

```
index.html
style.css
js/
  app.js       propojení modulů, události UI, stavový automat obrazovek
  camera.js    getUserMedia, přepnutí kamer, zastavení streamu
  film.js      look Kodak Tri-X (čistá zpracovávací logika nad ImageData)
  frame.js     rozměry a vykreslení panoramatického rámu s perforací
  save.js      Web Share API s fallbackem na stažení
  gallery.js   ukládání a načítání snímků v IndexedDB, zobrazení galerie
tests/
  frame.test.js, film.test.js   testy čisté logiky (Node, bez závislostí)
```

Moduly jsou ES moduly. `film.js` a `frame.js` neobsahují přístup k DOM (jen výpočty a kreslení do předaného canvasu), aby je šlo testovat.

## 5. Moduly

### camera.js
- `start(facingMode)` → `MediaStream` (ideální rozlišení 1920×1080, `facingMode` „environment“ nebo „user“).
- `stop()` uvolní stream.
- Chyby (`NotAllowedError`, `NotFoundError`, nedostupné API) se vrací jako typované výjimky, které `app.js` převede na hlášku.

### film.js (Kodak Tri-X 400)
Funkce `applyTriX(imageData, options)` pracuje na místě. Kroky:
1. **Černobílá** váženým mixem kanálů s mírným posunem k červené (Tri-X je citlivý do červené): `L = 0.40 R + 0.45 G + 0.15 B`.
2. **S-křivka** kontrastu s hlubokými černými a lehce zalitými světly (předpočítaná LUT o 256 hodnotách).
3. **Zrno:** šum s gaussovským rozdělením, síla závislá na jasu (nejvíc ve středních tónech), velikost zrna škálovaná podle výstupního rozlišení. Náhled používá nižší rozlišení a stejné parametry.
4. **Vinětace:** radiální ztmavení k okrajům, silná (typické pro Sprocket Rocket).
5. **Měkkost:** lehké rozostření okrajů (kopie zmenšená a zvětšená, smíchaná maskou podle vzdálenosti od středu).

Parametry jsou jedna konstanta `TRIX` (kontrast, zrno, vinětace, měkkost). `options.seed` umožňuje deterministické zrno pro testy.

### frame.js
- `layout(width)` vrací rozměry panoramatického rámu: poměr obrazu 2,2:1, okraje filmu nahoře a dole, pozice a velikost perforačních otvorů (zaoblené obdélníky, pravidelná rozteč), pozice čísla snímku a popisku.
- `drawFrame(ctx, image, width, meta)` vykreslí obraz do rámu. Snímek je plnoformátový, obraz jde až k okraji. Perforace jsou jen černé zaoblené otvory přes obraz (horní a dolní řada), dole je bílé číslování ve stylu hrany filmu (`35  ▶35A  36  ▶36A`). Žádný popisek filmu (TRI-X) se nezobrazuje.
- Použije se pro živý náhled (nízké rozlišení) i pro hotový snímek (vysoké).

### save.js
- `saveImage(blob, filename)`: pokud `navigator.canShare({files})` platí, zavolá `navigator.share`. Zrušení sdílení uživatelem se bere jako normální výsledek. Jinak stáhne soubor přes `<a download>`.
- Formát JPEG (kvalita 0,92), šířka nejvýše 3600 px.

### gallery.js
- IndexedDB databáze `sprocket`, store `shots` (id, čas, blob, miniatura).
- `add`, `list`, `remove`. Galerie je mřížka miniatur, klepnutí otevře snímek s tlačítky Uložit a Smazat.

### app.js
- Obrazovky: *kamera* a *galerie*.
- Smyčka náhledu přes `requestAnimationFrame`: kamera → ořez na 2,2:1 → `film.js` v nízkém rozlišení → `frame.js` → canvas na obrazovce.
- Spoušť: zmrazí aktuální snímek, zpracuje ho ve vysokém rozlišení, vykreslí do rámu, uloží do galerie, zobrazí záblesk a zahraje cvaknutí. Miniatura posledního snímku se aktualizuje.

## 6. Obrazovka kamery

- Živý náhled v panoramatickém rámečku s perforací, vystředěný na obrazovce (na výšku telefonu zabírá celou šířku, nad a pod ním tmavé pozadí).
- Dole velká kulatá spoušť. Vlevo přepínač orientace filmu, vpravo přepnutí kamery. Galerie (s miniaturou posledního snímku) je v levém horním rohu.
- Po pořízení snímku se žádný náhled nezobrazí, snímek se uloží do galerie (toast „Snímek uložen do galerie.“) a lze hned fotit dál. Uložení do Fotek je z detailu snímku v galerii (**Uložit / Sdílet**). Když se galerie neuloží, zobrazí se výsledek, aby šel uložit ručně.

## 7. Chyby

- Odepřená kamera: hláška „Povol prosím přístup ke kameře“ a tlačítko **Zkusit znovu**.
- Kamera nenalezena nebo stránka není na HTTPS: odpovídající hláška s vysvětlením.
- Selhání `navigator.share` (jiné než zrušení): fallback na stažení.
- Selhání IndexedDB: snímek se pořád zobrazí a dá se uložit, galerie se neukládá a zobrazí se upozornění.

## 8. Testování

- **Automaticky (Node, bez závislostí):** `frame.layout` (poměr 2,2:1, perforace v mezích, počet a rozteč otvorů), `film.applyTriX` (výsledek je šedotónový: R=G=B, vinětace ztmaví rohy víc než střed, deterministické zrno při stejném `seed`).
- **Ručně:** Chrome desktop přes `localhost`, telefon přes HTTPS (kamera, přepnutí, spoušť, uložení do Fotek přes sdílecí list, galerie, odepřená kamera).

## 9. Kritéria úspěchu

1. Na telefonu se otevře živý černobílý panoramatický náhled s perforací a zrnem.
2. Stisk spouště vytvoří snímek, který vypadá jako Tri-X na Sprocket Rocketu, a vykreslí se do 1 s.
3. Snímek lze uložit do Fotek (iOS/Android přes sdílecí list), na desktopu se stáhne.
4. Aplikace běží ze statického serveru bez build kroku a bez závislostí.
