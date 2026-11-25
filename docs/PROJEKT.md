# turmwacht – Projektsteckbrief

- **Zielgruppe:** Gelegenheitsspieler, die eine Partie in 10–30 Minuten spielen.
- **Kernaktion:** Türme neben den Weg bauen und so viele Wellen wie möglich halten.
- **Nicht-Ziele:** Keine Kampagne, keine Konten/Online-Bestenliste, keine Grafikdateien.

## Architekturentscheidungen

Deterministische Logik (Seed je Karte, eigener Zufallsstrom je Welle für die Vorschau), feste Zeitschritte 1/60 s, Treffer sofort ohne Projektile.

## Risiken

Balance nur per einfachem Bot gemessen; Spielgefühl nicht von Menschen getestet; Audio nicht angehört.

## MVP / Erfolgstest

Erfolgstest: `node --test` grün und die Kernaktion im Browser ohne Konsolenfehler bedienbar.
