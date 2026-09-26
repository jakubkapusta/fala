# Fala

> Surfing jednym kciukiem na nieskończonej łamiącej się fali, od świtu do bioluminescencyjnej nocy.

**Mieszanka:** Tiny Wings × Alto's Odyssey × surfing
**Status:** do realizacji. Plan zatwierdzony 2026-09-26, wykonuje osobny agent.

---

## Ustalenia (decyzje właściciela)

| Temat | Decyzja |
|---|---|
| Orientacja | **Obie, adaptacyjnie.** Telefon pionowo i poziomo oraz laptop. Kamera dopasowuje kadr do proporcji ekranu (szczegóły w sekcji *Kamera*). Zmiana orientacji w trakcie jazdy nie może niczego zepsuć. |
| Perspektywa | **Z boku, 2,5D.** Gra się przewija w bok. Patrzymy na ścianę fali z przodu, od strony kanału, jak na klasycznym zdjęciu surfingowym. Surfer jedzie w prawo wzdłuż fali, a za nim, po lewej, fala się łamie. Pion ekranu to góra i dół ściany fali. Tło (dalszy ocean, horyzont, niebo) jest w perspektywie, a sama rozgrywka dzieje się w płaszczyźnie. |
| Wywrotka | **Utrata prędkości, nie koniec gry.** Krzywe lądowanie albo uderzenie w przeszkodę kończy się wywrotką: prędkość spada o większość, a sterowanie wraca po chwili. Jazda kończy się **tylko** wtedy, gdy surfera połknie fala. |
| Styl | **Półrealistyczna woda, stylizowana reszta.** Efekt wow opiera się na shaderze wody: przeświecający turkus, piana, bryzg, refleksy. Surfer, deska, skały i ptaki to stylizowane sylwetki z obrysem światła, tak jak w Roju. |
| Język | Tekst dla gracza po polsku. Kod, komentarze i nazwy w kodzie po angielsku. Commity po polsku. |

---

## Formuła rozgrywki

### Pętla

Jedziesz w prawo wzdłuż ściany fali. Po lewej stronie ekranu fala się łamie: jej łamiąca się część (lip, a dalej zwój piany) przesuwa się w prawo z prędkością łamania. Musisz jechać szybciej, niż fala się łamie, ale moc bierze się z **kieszeni**, czyli stromej części tuż przed miejscem łamania. Im bliżej łamania, tym więcej mocy i tym większe ryzyko.

- Jedna jazda trwa 1–3 minuty (cel dla średniego gracza około 2 minut).
- Między jazdami: wynik, postęp misji, muszle i przycisk „jeszcze raz” pod kciukiem. Od końca jazdy do startu następnej mija mniej niż 2 sekundy.

### Jeden przycisk

| Stan | Przytrzymanie | Puszczenie |
|---|---|---|
| Na fali | **zjazd:** surfer kieruje się w dół ściany i przyspiesza grawitacyjnie | **wspinaczka:** surfer kieruje się w górę ściany i zamienia prędkość na wysokość |
| W powietrzu | **obrót** (w stronę, w którą leci) | brak obrotu, deska stabilizuje się powoli w stronę poziomu |
| W tubie | zjazd (niżej w tubie) | wspinaczka (wyżej w tubie) |

**Pompowanie:** rytmiczne przytrzymanie i puszczenie, czyli jazda zygzakiem góra–dół, daje przyspieszenie, bo fala pcha najmocniej w środkowej części ściany w kieszeni. Dobry gracz pompuje w rytmie fali, a słaby jedzie prosto i zwalnia.

**Wybicie:** jeśli dojedziesz do krawędzi fali z odpowiednią prędkością pionową, wylatujesz w powietrze. Wysokość lotu zależy od prędkości.

### Lądowanie

- Kąt deski porównuje się z nachyleniem ściany w punkcie lądowania.
- **Idealne** (różnica ≤ 12°): przyspieszenie, dźwięk i błysk, krótkie zwolnienie tempa po dużym triku.
- **Czyste** (≤ 35°): trik zaliczony, bez straty prędkości.
- **Krzywe** (> 35°): wywrotka. Prędkość spada do około 25%, przez około 1,2 s nie ma sterowania, a surfer wdrapuje się z powrotem na deskę. Mnożnik się zeruje.

### Tuba

Na odcinkach, gdzie fala się zamyka, lip przerzuca się nad ścianą i tworzy tunel. Wewnątrz jest pas bezpiecznej wysokości:

- za wysoko: lip uderza w surfera, wywrotka,
- za nisko: piana, hamowanie,
- punkty rosną z każdą sekundą w tubie,
- wyjście z tuby w chmurze bryzgu daje dużą premię i mnożnik.

### Koniec jazdy

Fala połyka surfera, gdy zwój piany go dogoni, czyli gdy x surfera jest mniejszy niż pozycja łamania minus margines. Zwykle dzieje się tak po wywrotce przy zbyt małej prędkości albo na sekcji zamykającej, której nie udało się przejechać.

### Punkty

- **Dystans:** 1 pkt za metr.
- **Triki:** obrót za każde 180°, wysokość lotu, idealne lądowanie, czas w tubie, wyjście z tuby.
- **Mnożnik:** rośnie z kolejnymi czystymi trikami bez wywrotki, a wywrotka go zeruje.
- **Muszle:** waluta, nie punkty.

---

## Fala: sekcje i zawartość jazdy

Fala składa się z **sekcji** losowanych ziarnem jazdy, tak jak fragmenty poziomów w Roju. Parametry sekcji to: długość, wysokość ściany H, stromość, prędkość łamania i typ.

| Sekcja | Charakter |
|---|---|
| Otwarta ściana | średnia wysokość i prędkość łamania. Miejsce na triki |
| Stroma | wysoka, stroma, dużo mocy, wysokie wybicia |
| Płaska / tłusta | niska, prawie bez mocy. Trzeba pompować albo zwolnić |
| Tuba | lip przerzuca się nad ścianą, pas tuby |
| Zamykająca | prędkość łamania większa niż prędkość surfera. Zapowiedziana z wyprzedzeniem białą grzywą na krawędzi fali. Trzeba ją przejechać na pełnej prędkości albo przeskoczyć lotem nad zamykającym się fragmentem |

**Przeszkody i pomocnicy** (na ścianie, na określonych wysokościach):

- **Przeszkody:**
  - skały na dole ściany (zmuszają do jazdy wyżej),
  - boje i kłody (wywrotka przy uderzeniu, można je przeskoczyć),
  - inny surfer (jedzie wolniej, trzeba go minąć górą albo dołem),
  - meduzy przy samym dole.
- **Pomocnicy:**
  - delfiny (płyną w ścianie, jazda obok daje przyspieszenie),
  - pelikany (trafienie w powietrzu daje drugie wybicie).
- **Muszle:** ułożone w linie i łuki, które podpowiadają dobrą trasę.

Trudność rośnie z dystansem: szybsze łamanie, więcej sekcji zamykających i przeszkód, mniej pomocników. Tak jak w Roju, kiedy graczowi idzie źle, pojawia się delikatnie więcej pomocników.

---

## Pora dnia i pogoda

- Cykl dnia postępuje z dystansem: świt, południe, złota godzina, zachód, noc, świt. Pełny cykl trwa około 6 minut jazdy, a jazda zaczyna się w losowej porze. Dzięki temu różne jazdy wyglądają różnie, a noc jest nagrodą za długą jazdę.
- **Noc:** bioluminescencja. Ślad deski, bryzg i łamiąca się piana świecą na niebiesko. Scena jest ciemna, a światło daje sama woda.
- **Sztorm:** rzadkie zdarzenie w trakcie jazdy albo stała cecha niektórych spotów. Wyższe fale, deszcz, błyskawice oświetlające ścianę, ciemnozielona woda.

---

## Kamera (adaptacyjna)

- Świat jest w jednostkach, y rośnie w górę. Ściana fali ma wysokość H około 100 jednostek dla sekcji średniej (od 60 dla płaskiej do 180 dla dużych fal na Nazaré).
- Kamera spełnia kilka warunków naraz i wybiera najmniejszy zoom, który spełnia wszystkie:
  1. widać całą wysokość ściany plus zapas na lot (wysokość lotu z płynnym dojazdem),
  2. **widać co najmniej 1,4 s drogi przed surferem** przy aktualnej prędkości,
  3. widać pozycję łamania i kawałek zwoju piany za surferem, żeby gracz czuł pościg.
- **Pionowo** warunek 2 wymusza oddalenie, a nadmiar pionowej przestrzeni wypełniają niebo (góra) i woda przed falą (dół).
- **Poziomo** warunek 1 zwykle decyduje, a widać dużo drogi przed sobą. Balans (prędkości, zapowiedzi zagrożeń) musi działać w obu układach, a zapowiedzi zagrożeń nie mogą zależeć od tego, co akurat mieści się w kadrze.
- Zoom zmienia się płynnie (sprężyna), bez szarpnięć. Przy wysokich lotach kamera się oddala, przy lądowaniu wraca.
- Zmiana rozmiaru okna i obrót telefonu w trakcie jazdy przeliczają kadr bez przerywania gry.

---

## Sterowanie

- **Telefon:** dotyk w dowolnym miejscu ekranu, przytrzymanie albo puszczenie. Multi-touch się nie liczy (dowolny palec na ekranie oznacza „trzymam”).
- **Laptop:** spacja albo lewy przycisk myszy. Esc to pauza.
- Blokada przewijania, zoomu i menu kontekstowego na płótnie gry (`touch-action: none`, `preventDefault`). Pauza przy utracie widoczności karty.

---

## Efekt wow: wymagania graficzne

Wszystko proceduralne, bez plików graficznych i dźwiękowych. Surowy WebGL2 bez silnika, tak jak w Roju.

1. **Ściana fali:** siatka rozpięta wzdłuż x i wzdłuż profilu fali (dolina, wklęsła ściana, grzbiet, lip). Profil dla każdego x wynika z parametrów sekcji i odległości od punktu łamania: daleko przed łamaniem łagodny garb, w kieszeni stroma wklęsła ściana, przy łamaniu przewieszony lip. Szczegóły powierzchni to przewijane normalne z szumu oraz smugi spływające po ścianie.
2. **Przeświecanie:** grubość wody przy grzbiecie i lipie jest mała. Kiedy słońce jest za falą, ta cienka część świeci turkusem. **To wizytówka gry i ma robić wrażenie na zrzucie ekranu.**
3. **Kolor wody:** zależny od grubości i głębokości (od turkusu w cienkich miejscach po ciemny granat), odbicie nieba z efektem Fresnela, refleks słońca.
4. **Piana:** biała grzywa na krawędzi lipu, zwój piany za łamaniem (warstwy szumu i billboardy), piana spływająca po ścianie za surferem.
5. **Cząstki:** wachlarz bryzgu spod deski (zależny od prędkości i skrętu), odprysk z lipu, mgiełka za łamaniem, krople przy lądowaniu.
6. **Tło:** dalszy ocean z falami Gerstnera w perspektywie, horyzont, niebo z gradientem pory dnia, słońce i księżyc, proceduralne chmury, w nocy gwiazdy.
7. **Surfer:** stylizowana sylwetka z obrysem światła od słońca, kilka póz (przykucnięcie przy zjeździe, wyprost przy wspinaczce, pozy lotu, wywrotka z animacją).
8. **Postprocessing:** bloom, tone mapping ACES, ziarno, lekka aberracja przy idealnych lądowaniach, krótkie zwolnienie tempa.
9. **Noc:** bioluminescencyjny ślad i piana, jak opisano wyżej.
10. **Sztorm:** deszcz, błyskawice, ciemniejsza paleta.

**Wydajność:** 60 fps na średnim telefonie. Automatyczne obniżanie jakości (rozdzielczość renderu, gęstość siatki fali, liczba cząstek), tak jak `quality` w Roju.

---

## Dźwięk

Wszystko syntezowane w Web Audio:
- szum fali zależny od wysokości ściany,
- syk deski zależny od prędkości,
- grzmot łamania za plecami, głośniejszy, gdy fala jest blisko (dźwiękowy sygnał zagrożenia),
- w tubie dźwięk stłumiony filtrem dolnoprzepustowym, a przy wyjściu nagle otwarty,
- pluśnięcie przy wywrotce,
- ton i akord przy idealnym lądowaniu,
- mewy (krótkie ćwierki syntezy FM),
- w tle spokojne pady w klimacie lo-fi, zmieniające się z porą dnia.

---

## Postęp i meta

- **Spoty** (odblokowywane kolejno):
  1. **Hawaje:** turkus, łagodne fale, nauka.
  2. **Bali:** dużo tub, rafa pod powierzchnią, zachody.
  3. **Islandia:** zimna, ciemna woda, zorza, kra jako przeszkoda.
  4. **Zatoka bioluminescencji:** zawsze noc.
  5. **Nazaré:** gigantyczne fale, sztorm. Finałowy spot.
- **Misje:** 15 na spot, 3 aktywne naraz, jak w Alto. Przykłady: „zrób 360 w tubie”, „przejedź 1 km bez wywrotki”, „zbierz 40 muszli w jednej jeździe”. Wykonane misje podnoszą poziom surfera, a poziom odblokowuje kolejne spoty.
- **Deski** (kupowane za muszle), różniące się parametrami:

  | Deska | Charakter |
  |---|---|
  | Longboard | stabilny, szerokie okno lądowania, wolne obroty |
  | Shortboard | szybkie obroty, wąskie okno lądowania |
  | Fish | szybki na płaskich sekcjach |
  | Gun | stabilny na wielkich falach |

- **Wygląd:** kolor pianki surfera i kolor śladu.
- **Fala dnia:** ziarno z daty, jedna próba liczona do rekordu dnia.
- **Rekordy** osobno dla każdego spotu.
- **Zapis:** `localStorage` z kluczami `fala.meta.v1`, `fala.stats.v1`, `fala.hints.v1`, każdy odczyt i zapis w `try/catch`.

---

## Technicznie

- **Repozytorium:** `~/code/fala`, publiczne repo na GitHubie `jakubkapusta/fala`, gra na GitHub Pages.
- **Stack:** Vite, TypeScript, surowy WebGL2, Web Audio, PWA z service workerem (działa offline po pierwszym wejściu). Czcionki z `@fontsource`, jeśli potrzebne.
- **Wzorzec: `~/code/roj`.** Kod stamtąd kopiujemy, a nie importujemy. Do skopiowania:
  - pipeline renderera: bloom, composite z ACES, ziarno, fala uderzeniowa, aberracja,
  - funkcja `safe()` czyszcząca NaN,
  - plugin service workera w `vite.config.ts`,
  - `scripts/icons.mjs`,
  - workflow `.github/workflows/pages.yml`,
  - struktura `balance.ts` i symulatora balansu (`npm run sim`),
  - HUD w DOM i ekrany z `.screen` używającym `visibility: hidden`.
- **Balans:** wszystkie liczby rozgrywki są w `src/game/balance.ts` (`BAL`), bez liczb zaszytych w regułach. Symulator jazd bez grafiki z botem o parametrze `skill` od 0 do 1.
  - Cele pierwszego podejścia:
    - średnia jazda gracza o `skill` 0,5 trwa 90–150 s,
    - gracz o `skill` 0,9 regularnie dojeżdża do nocy (czyli ponad 4 minuty),
    - gracz o `skill` 0,2 wytrzymuje co najmniej 40 s.
  - Symulator ma sprawdzić, czy sekcje zamykające da się przejechać przy dobrej grze.
- **Plik dla agentów:** `CLAUDE.md` w repo w stylu Roju: komendy, mapa kodu, zasady, które gryzą.
- **Dokument projektu:** ten plan jako `docs/PLAN.md` w repo.
- **Zasady z Roju, które obowiązują:**
  - kolory w shaderach są liniowe,
  - nie używać `pow` z ujemną podstawą (na GPU Mali i Adreno daje NaN),
  - zawsze używać ziarnistego RNG, nigdy `Math.random()` w logice gry,
  - ekrany ukryte nie mogą łapać stuknięć.
- **Deploy:** po `git push` nie czekać na GitHub Actions i nie odpytywać statusu.

---

## Kamienie milowe i kryteria odbioru

Nadzorca sprawdza wynik po każdym kamieniu milowym. **Po M1 wykonawca zatrzymuje się i czeka na test sterowania przez właściciela na telefonie.** To najważniejszy punkt kontrolny projektu.

### M0: Szkielet
Repo, Vite i TS, kontekst WebGL2 z pustą sceną, PWA, ikony, workflow Pages, `CLAUDE.md`, `docs/PLAN.md`.
**Odbiór:** `npm run build` przechodzi, a strona jest opublikowana na Pages.

### M1: Czucie jazdy (grafika zastępcza)
Model fizyki z balansu, jeden przycisk, pogoń fali, lot, obrót, lądowanie, wywrotka, połknięcie przez falę, kamera adaptacyjna, generator z sekcjami otwartą, płaską i zamykającą. Grafika: proste linie i kształty.
**Odbiór:**
- da się grać na telefonie w pionie i w poziomie oraz na laptopie,
- pompowanie wyraźnie daje prędkość,
- lądowanie jest czytelne,
- symulator działa i raportuje czas jazdy.

**STOP: test właściciela.**

### M2: Woda z efektem wow
Siatka ściany fali, przeświecanie, piana, bryzg, tło z niebem i oceanem, cykl pory dnia, postprocessing, obniżanie jakości.
**Odbiór:**
- zrzuty ekranu przy świcie, w południe, przy zachodzie i w nocy, w pionie i w poziomie,
- 60 fps w emulacji średniego telefonu,
- brak NaN i migających bloków.

### M3: Pełna jazda
Wszystkie typy sekcji, tuba, przeszkody i pomocnicy, muszle, punkty, mnożnik, triki, HUD, menu, ekran końca jazdy, szybki restart, dźwięk, podpowiedzi przy pierwszej jeździe.
**Odbiór:** symulator spełnia cele z sekcji *Technicznie*, a cała pętla od menu przez jazdę i koniec do restartu działa bez błędów.

### M4: Meta
Spoty (Hawaje, Bali, Islandia, Zatoka, Nazaré), misje, deski, poziom surfera, fala dnia, rekordy, zapis.
**Odbiór:** postęp przetrwa przeładowanie strony, a każdy spot ma swój wygląd i charakter.

### M5: Szlif
Sztorm, bioluminescencja w pełnej wersji, zwolnienie tempa i zdjęcia najlepszych momentów, dostrojenie balansu, wydajność na słabszych telefonach, tryb offline.
**Odbiór:** gra działa offline, a na telefonie nie ma spadków płynności przy intensywnych efektach.

---

## Model fizyki (punkt startowy dla `balance.ts`)

Liczby to punkt wyjścia do strojenia, nie wartości ostateczne.

- **Stan surfera:** pozycja (x wzdłuż fali, y na ścianie od 0 w dolinie do H(x) na krawędzi), wektor prędkości, kąt kursu, stan (fala, powietrze, tuba, wywrotka).
- **Na fali:**
  - kurs obraca się w stronę kursu docelowego: −55° przy przytrzymaniu, +50° po puszczeniu, z prędkością obrotu około 260°/s,
  - zmiana prędkości: grawitacja wzdłuż ściany (−g·sin(kurs), g ≈ 900 j/s²), plus pchnięcie fali P (≈ 380 j/s²), minus opór,
  - pchnięcie P jest największe w kieszeni i w środkowej wysokości ściany, a maleje z odległością od łamania (zanik na około 2H przed łamaniem) i przy samym dole ściany,
  - opór rośnie z kwadratem prędkości, a na płaskich sekcjach i w pianie jest większy.
- **Prędkość łamania:** około 420 j/s dla otwartej ściany, 600 j/s dla zamykającej, 300 j/s dla płaskiej. Prędkość surfera przy dobrym pompowaniu: około 500–650 j/s.
- **Wybicie:** gdy y przekroczy H(x) z dodatnią prędkością pionową, surfer jest w powietrzu. Grawitacja w powietrzu ≈ 1400 j/s² (lot ma trwać około 0,6–1,2 s). Obrót przy przytrzymaniu: 540°/s (zależny od deski).
- **Połknięcie:** gdy x surfera jest mniejszy niż pozycja łamania minus około 0,15H.
- **Wywrotka:** prędkość ×0,25, 1,2 s bez sterowania, a potem powrót z kursem poziomym.

---

## Ryzyka i otwarte pytania

- **Czucie fizyki** jest kluczowe. Model powyżej to punkt startowy, a M1 służy do iteracji właśnie nad tym. Jeśli pompowanie nie daje radości, poprawiamy model przed grafiką.
- **Przewieszony lip w 2,5D** musi wyglądać dobrze w przekroju i nie tworzyć artefaktów siatki przy zwijaniu.
- **Czytelność w pionie:** oddalenie kamery może zrobić surfera za małym. Minimalny rozmiar surfera na ekranie około 28 px wysokości, a jeśli potrzeba, sylwetka z obrysem.
- **Dźwięk na iOS** wymaga pierwszego dotyku i nie działa przy przełączniku wyciszenia. Trzeba o tym informować, tak jak w Roju.
