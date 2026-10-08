# Changelog

Chronologicky, nejstarší nahoře. Hashe odkazují na `git log`. Krátké „proč“ je zde, protože v commitech nebývá.

## 2026-10-07: první verze

Postup: brainstorming → specifikace → implementační plán → provedení po taskách (TDD) → závěrečná revize celé větve čerstvým reviewerem.

- `77059d8` specifikace, `59c9932` plán (`docs/superpowers/`).
- `dcc8693`, `06158f4` rozměry rámu, ořez a vykreslení perforace (`js/frame.js`).
- `b0fe21b` look Kodak Tri-X: černobílá, S-křivka, zrno, vinětace, měkké okraje (`js/film.js`).
- `1dcdf3b` kamera s rozlišenými chybami (odepřeno, nenalezeno, nezabezpečený kontext) (`js/camera.js`).
- `efe3b7c` uložení přes Web Share API, jinak stažení (`js/save.js`).
- `ddf9392` galerie v IndexedDB (`js/gallery.js`).
- `fdf95e5` UI, focení, galerie (`index.html`, `style.css`, `js/app.js`).
- `73df643` README.
- `c9cfe78` oprava z revize: souběžné starty kamery nechávaly běžet nezastavený stream. Starší start se teď zruší (`superseded`).
- `a431a03` oprava: při otevření dvojklikem (`file://`) se moduly nenačtou a aplikace byla tiše prázdná. Teď ukáže návod, jak spustit server.

Rozhodnutí: jediný film Tri-X, zdroj jen živá kamera, volné focení bez počítadla a přetáčení, minimalistické UI. Odložené drobnosti z revize jsou v `STATUS.md`.

## 2026-10-07: úprava podle referenčního snímku (`7e5dd3d`)

Zpětná vazba: odstranit TRI-X z pásu, jemnější zrno, vyšší kontrast, špatný formát.

- Formát 3:1 → **2,2:1** podle referenčního snímku 2860×1302.
- Rám je plnoformátový: žádné černé pásy, perforace jsou jen černé zaoblené otvory přes obraz, dole bílé číslování.
- Popisek „KODAK TRI-X 400“ odstraněn.
- Zrno 0,09 → 0,045, kontrast (S-křivka) 0,55 → 0,7.

## 2026-10-08: orientace, rozlišení, ultraširoký záběr (`8d28a21`)

- Přepínač orientace filmu: na šířku nebo na výšku (svislý pás s perforací po stranách). Volba se pamatuje.
- Galerie přesunuta nahoru. Po focení se už neukazuje náhled, snímek jde do galerie a lze hned fotit dál (při selhání galerie se výsledek ukáže, aby šel uložit).
- Žádost o co nejvyšší rozlišení kamery (4096×3072), strop snímku 3600 px na delší straně.
- Zadní ultraširoká kamera, případně zoom pod 1×. Závisí na telefonu a prohlížeči.

## 2026-10-08: dokumentace (`66f692a`)

- `docs/STATUS.md`: co je neověřeno na telefonu, odložené drobnosti, omezení.

## 2026-10-08: opravy z testu na telefonu (`f66d939`)

- Šipka v číslování (`▶`) se na iOS vykreslila jako barevné emoji. Teď je kreslená jako trojúhelník.
- Po přepnutí portrét → landscape byl náhled zdeformovaný. Příčinu v Chrome nešlo reprodukovat (domněnka: iOS Safari nepřepočítal rozměry z CSS `aspect-ratio`). Rozměr hledáčku se teď počítá v JS a nastavuje v pixelech (`fitBox`). Oprava byla na telefonu potvrzena uživatelem.

## 2026-10-08: zoom a rozložení (`7bd6948`)

- Zoom ve třech krocích na jednom tlačítku: `0,5×` (ultraširoké, výchozí), `1×` (hlavní kamera), `10×` (zoom kamery, je-li podporovaný, zbytek digitální ořez; snímek se zvětší nejméně na 1920 px na delší straně).
- Přepnutí kamery (selfie) přesunuto doprava nahoru, zoom je dole vpravo.
- Hledáček zarovnán nahoru, 1,5 rem pod tlačítky.
- Zoom a kvalita `10×` zatím nebyly ověřeny na telefonu.
