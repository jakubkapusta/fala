# Fala

Przeglądarkowa gra na telefon (pionowo i poziomo) i laptop: surfing jednym kciukiem na nieskończonej łamiącej się fali, od świtu do bioluminescencyjnej nocy.

- **Sterowanie:** przytrzymaj (palec, spacja, lewy przycisk myszy) — zjazd w dół ściany; puść — wspinaczka. W powietrzu przytrzymanie obraca deską. Esc — pauza.
- **Projekt gry:** [docs/PLAN.md](docs/PLAN.md)

```bash
npm install
npm run dev      # serwer deweloperski
npm run build    # statyczne pliki w dist/
npm run sim      # symulator balansu bez grafiki
```

Każdy push na `main` buduje grę i publikuje ją na GitHub Pages (`.github/workflows/pages.yml`). W ustawieniach repozytorium: Settings → Pages → Source: **GitHub Actions**.
