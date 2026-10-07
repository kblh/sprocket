# Sprocket Rocket

Simulace panoramatického foťáku Lomography Sprocket Rocket s černobílým filmem Kodak Tri-X 400.
Čisté HTML + CSS + JS, bez build kroku.

## Spuštění

```bash
python3 -m http.server 8000
```

Otevři `http://localhost:8000`. Kamera funguje jen na `localhost` nebo přes HTTPS.

## Na telefonu

Adresa s IP v síti (`http://192.168.x.x`) kameru neumožní. Použij jednu z cest:
- Android + Chrome: USB kabel, `chrome://inspect` na počítači, port forwarding 8000 (telefon pak vidí `localhost:8000`).
- HTTPS tunel, např. `cloudflared tunnel --url http://localhost:8000` nebo `ngrok http 8000`.
- Nasazení statických souborů na libovolný HTTPS hosting (GitHub Pages, Netlify).

## Ukládání

Na telefonu tlačítko „Uložit / Sdílet“ otevře sdílecí list, ve kterém zvolíš „Uložit obrázek“ (do Fotek). Na počítači se soubor stáhne.

## Testy

```bash
npm test   # Node ≥ 20
```
