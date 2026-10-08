# Stav projektu

Poslední aktualizace: 2026-10-08

## Kde co je

- `docs/superpowers/specs/2026-10-07-sprocket-rocket-design.md`: aktuální specifikace (udržovaná průběžně).
- `docs/superpowers/plans/2026-10-07-sprocket-rocket.md`: **historický** plán původní stavby. Neodpovídá dnešnímu kódu (3:1, černé pásy, popisek TRI-X). Neaktualizuje se.
- Průběh vývoje je v historii gitu (`git log`).

## Neověřeno na skutečném telefonu

Vše bylo ověřeno jen v headless Chrome na Macu (falešná a syntetická kamera) a v testech v Node.

- Spuštění kamery a živý náhled přes HTTPS na iOS Safari a Android Chrome.
- Uložení do Fotek přes sdílecí list (Web Share API se souborem). V testech je jen napodobený `navigator`.
- Jestli iOS Safari dekóduje obraz ze skrytého `<video>` (1×1 px, `opacity: 0`). Pokud ne, náhled zůstane černý.
- Ultraširoká kamera: výběr podle názvu zařízení z `enumerateDevices()` a zoom pod 1×. Závisí na telefonu a prohlížeči, na Macu nejde otestovat.
- Zoom: zda telefon nabídne `zoom` v `getCapabilities()` (Android Chrome ano, iOS Safari nejspíš ne). Bez něj je 10× jen digitální ořez, tedy výrazně méně detailů.
- Zpracování snímku 3600×1636 na starších iPhonech (paměť, doba, odhad 1–2 s).

## Odložené drobnosti ze závěrečné revize

Nebyly opraveny, žádná není kritická.

1. Výsledek čeká na zápis do IndexedDB bez timeoutu. Když se IndexedDB zasekne, snímek se neuloží (po poslední úpravě se zasekne jen ukládání na pozadí, focení běží dál).
2. Selhání `toBlob` (např. málo paměti na iOS) se hlásí jen obecným toastem „Snímek se nepodařilo uložit.“.
3. Dvojklik na „Uložit / Sdílet“ může otevřít sdílecí list i stáhnout soubor (`InvalidStateError` se bere jako chyba, ne jako zrušení).
4. Cvaknutí na iOS po návratu z pozadí ztichne, protože se `AudioContext` neobnoví (`resume()`).
5. Živý náhled se počítá i pod overlayem a pod hláškou o kameře. Navíc se při každém snímku náhledu alokují pole `Float32Array` (baterie a GC na slabých telefonech).
6. Sdílený pracovní canvas se při přepnutí mezi náhledem (640 px) a snímkem (až 3600 px) vždy znovu alokuje.
7. Náhled přední kamery není zrcadlený (uložený snímek zrcadlený být nemá).
8. `refreshLastThumb` načítá všechny záznamy z galerie včetně plných blobů, jen aby získal poslední miniaturu (stačil by kurzor).
9. Při návratu do záložky se kamera restartuje i při zobrazené hlášce o odepřeném přístupu. Chrome pak může dotaz vyvolat znovu.
10. Po neúspěšném restartu kamery může zůstat zamrzlý poslední snímek (neprovádí se `video.srcObject = null`).

## Známá omezení

- Snímky uložené v galerii před změnou formátu zůstávají ve starém formátu 3:1 a se starým rámem.
- Na telefonu drženém na výšku vychází pás „na šířku“ jen kolem 1080×491 px. Pro velký snímek na šířku drž telefon naležato, nebo přepni na svislý pás.
- Číslo snímku (1–36) je jen dekorace na okraji filmu a nezávisí na galerii (ukládá se do `localStorage`).
- Strop rozlišení je 3600 px na delší straně (paměť na mobilech).

## Nápady, které se nedělaly

- Soudkovité zkreslení a silnější vinětace pro víc „široký“ vzhled originálu.
- Další filmy, ruční ostření, dvojitá expozice (mimo rozsah).
