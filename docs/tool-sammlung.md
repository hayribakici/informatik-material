# Website pflegen

Die Website verwendet Hugo Book ohne eigene HTML-Layouts, Styles oder JavaScript.
Das Theme war bereits im Projekt vorhanden. Seine Standard-Seitenleiste, Suche,
Tabellenformatierung und mobile Navigation werden unverändert genutzt.

Die Hauptseite wird vollständig in `content/_index.md` gepflegt. Jede Kategorie
ist eine Markdown-Überschrift mit einer eigenen Tabelle aus verlinktem
Werkzeugnamen und kurzer Beschreibung. Die Kopfzellen bleiben leer.
Die Tabellenbreite bestimmt das unveränderte Theme anhand des Inhalts;
getrennte Tabellen sind daher nicht zwingend gleich breit.
Die Kategorien in der Seitenleiste sind normale Hugo-Menüeinträge in `hugo.toml`
und verweisen auf die automatisch erzeugten Überschriften-Sprungziele.

Externe Links können mit dem eingebauten `button`-Shortcode von Hugo Book
angelegt werden; dieser öffnet sie mit `target="_blank"` und `rel="noopener"`.
Interne Ziele werden als normale Markdown-Links eingetragen.

`content/tools/` enthält weiterhin die Eintragsdaten und einfache Detailseiten.
Die bisherige separate Übersicht verweist auf die Hauptseite. Die Tabellen der Hauptseite werden bewusst manuell gepflegt, damit keine eigenen Templates erforderlich sind.
Die Theme-Suche ersetzt die selbst entwickelten Filter.

Die eigenständigen Anwendungen unter `static/`, insbesondere Pixel-Labor,
bleiben unabhängig von Hugo. `data/portfolio.toml` ist als Altbestand erhalten,
wird vom Book-Theme aber nicht verwendet.

Vorschau: `hugo server`. Produktionsbuild: `hugo --minify` (Hugo Extended).
Die entfernten lokalen Layout-Overrides und die vorherige Konfiguration wurden
vor der Umstellung unter `/tmp/info-material-before-book-theme` gesichert.
