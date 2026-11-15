# hatena-blog-mcp

[English](./README.md) | [日本語](./README.ja.md) | [简体中文](./README.zh-CN.md) | [繁體中文](./README.zh-TW.md) | [한국어](./README.ko.md) | [Español](./README.es.md) | [Français](./README.fr.md) | **Deutsch** | [Português (Brasil)](./README.pt-BR.md)

[![npm version](https://img.shields.io/npm/v/@kagayoi/hatena-blog-mcp)](https://www.npmjs.com/package/@kagayoi/hatena-blog-mcp)

> [!IMPORTANT]
> Dieses Repository ist ein inoffizieller, unabhängig gepflegter Fork von [Keisuke69/hatena-blog-mcp](https://github.com/Keisuke69/hatena-blog-mcp). Zu den fork-spezifischen Änderungen gehören die Unterstützung von Hatena Fotolife, die Erkennung von Aktualisierungskonflikten, defensive Größenbeschränkungen und eine lokale stdio-Laufzeit. Probleme zu diesen Änderungen melden Sie bitte an [diesen Fork](https://github.com/1llum1n4t1s/KG.hatena-blog-mcp/issues). Details finden Sie in [CHANGELOG.md](./CHANGELOG.md).

Ein lokaler MCP-Server (Model Context Protocol) zum Lesen und Schreiben über die [Hatena Blog AtomPub API](https://developer.hatena.ne.jp/ja/documents/blog/apis/atom) und die [Hatena Fotolife Atom API](https://developer.hatena.ne.jp/ja/documents/fotolife/apis/atom/). Er kommuniziert über stdio unter Node.js und benötigt keinen extern gehosteten MCP-Endpunkt und kein Relay.

## Funktionen

- 13 Tools für Beiträge, Seiten, Kategorien und Fotolife-Bilder
- Sichere partielle Aktualisierungen in `update_entry` und `update_page` mit Konflikterkennung über `expected_edited`
- Automatische Auswahl des Eyecatch-Bildes über einen optionalen Block mit dem ersten Bild im Beitragstext
- Keine automatische Wiederholung bei POST, um doppelte Beiträge und Bild-Uploads zu vermeiden
- Defensive Limits für XML, Inhalte, Kategorien, Bilder und Fehler-Bodys
- Zugangsdaten stammen aus lokalen Umgebungsvariablen des Prozesses, nie aus Kommandozeilenargumenten

## Schnellstart

### Voraussetzungen

- Node.js 22 oder neuer
- Ihre Hatena-ID
- Der API-Schlüssel, der unter Hatena Blog → Einstellungen → Erweitert → AtomPub angezeigt wird

Registrieren Sie den Server in einem beliebigen MCP-Client mit stdio-Unterstützung:

```jsonc
{
  "mcpServers": {
    "hatena-blog": {
      "command": "npx",
      "args": ["--yes", "@kagayoi/hatena-blog-mcp@latest"],
      "env": {
        "HATENA_ID": "your-hatena-id",
        "HATENA_API_KEY": "your-atompub-api-key"
      }
    }
  }
}
```

Findet ein Windows-Client `npx` nicht, verwenden Sie `npx.cmd`. Nutzen Sie nach Möglichkeit den Geheimnisspeicher des Clients oder des Betriebssystems, anstatt die Zugangsdaten direkt in einer gemeinsam genutzten Konfigurationsdatei abzulegen.

### Updates

Die Angabe `@latest` wird beim Start des MCP-Prozesses auf den npm-Dist-Tag `latest` aufgelöst. Der MCP schreibt sich nicht selbst um und kontaktiert zur Laufzeit keinen eigenen Update-Dienst. Für reproduzierbare Installationen ersetzen Sie `latest` durch die genaue Release-Version, die Sie verwenden möchten.

Wenn Sie den Server bereits mit einer festen Version registriert haben (zum Beispiel `@kagayoi/hatena-blog-mcp@1.0.6`), ändern Sie das Paketargument in dieser Registrierung auf `@kagayoi/hatena-blog-mcp@latest`. Die Aktualisierung dieser README ändert bestehende Registrierungen nicht, aber nach dieser Anpassung verwendet jeder Start automatisch das neueste Release.

### Aus dem Quellcode ausführen

```sh
git clone https://github.com/1llum1n4t1s/KG.hatena-blog-mcp.git
cd KG.hatena-blog-mcp
pnpm install --frozen-lockfile
pnpm build
```

Setzen Sie den Client-Befehl auf `node`, übergeben Sie den absoluten Pfad zu `dist/cli.js` und geben Sie dieselben zwei Umgebungsvariablen an.

## Authentifizierung und Datenfluss

Beim Start leitet der Prozess aus `HATENA_ID` und `HATENA_API_KEY` einen Basic-Authorization-Header für AtomPub ab, der nur im Arbeitsspeicher gehalten wird. Für Fotolife-Anfragen wird aus denselben Zugangsdaten jeweils ein frischer WSSE-Header erzeugt. Der Server speichert weder Zugangsdaten noch Beiträge oder Bilder dauerhaft.

`blog_id` ist die Domain des Blogs, zum Beispiel `example.hatenablog.com` oder `example.hateblo.jp`. Bei Gruppenblogs überschreibt das optionale Tool-Argument `hatena_id` ausschließlich die Hatena-ID, die in der Upstream-URL verwendet wird.

## Tool-Referenz

### Beiträge

| Tool | Zweck | Erforderlich | Wichtige Optionen |
| --- | --- | --- | --- |
| `list_entries` | Beiträge auflisten, 7 pro Seite | `blog_id` | `hatena_id`, `page`, `include_html` |
| `get_entry` | Einen Beitrag abrufen | `blog_id`, `entry_id` | `hatena_id`, `include_html` |
| `create_entry` | Einen Beitrag erstellen | `blog_id`, `title`, `content` | `content_type`, `eyecatch_image_url`, `categories`, `draft`, `preview`, `scheduled`, `updated`, `custom_url` |
| `update_entry` | Einen Beitrag partiell aktualisieren | `blog_id`, `entry_id` | `title`, `content`, `eyecatch_image_url`, `categories`, `draft`, `preview`, `custom_url`, `touch_updated`, `expected_edited` |
| `delete_entry` | Einen Beitrag löschen | `blog_id`, `entry_id` | `hatena_id` |

`update_entry` ruft den aktuellen Beitrag ab und übernimmt nur ausdrücklich angegebene Felder. Nicht angegebene Werte für Titel, Text, Inhaltstyp, Veröffentlichungsstatus, Kategorien, Zeitstempel und Slug bleiben erhalten. Übergeben Sie `categories: []`, um die Kategorien zu leeren. Stimmt `expected_edited` nicht mit dem aktuellen Wert überein, bricht das Tool vor dem PUT ab und meldet einen Konflikt.

Ein neuer, geplanter Beitrag erfordert `scheduled: true`, `draft: true` und einen Veröffentlichungszeitstempel in `updated`. Lässt Hatena `scheduled` in einer GET-Antwort weg, wird das Feld auch im Ergebnis und im Update-XML weggelassen, statt als `false` erzeugt zu werden. Bestehende Veröffentlichungszeitstempel ändern sich nur mit `touch_updated: true`.

#### Automatisches Eyecatch-Bild aus dem ersten Bild im Beitragstext

Wird `eyecatch_image_url` an `create_entry` oder `update_entry` übergeben, fügt der MCP am Anfang des Beitragstextes einen eindeutig erkennbaren HTML-Bildblock ein. Hatena Blog kann dann automatisch das erste Bild im Beitragstext auswählen. Das Eyecatch-Feld von Hatena wird dadurch nicht direkt gesetzt, und das Bild bleibt im Beitragstext sichtbar.

```json
{
  "name": "create_entry",
  "arguments": {
    "blog_id": "example.hatenablog.com",
    "title": "Ein Beitrag mit automatischem Eyecatch",
    "content": "### Text\n\nHier beginnt der Artikel.",
    "content_type": "text/x-markdown",
    "eyecatch_image_url": "https://cdn-ak.f.st-hatena.com/images/fotolife/example.png"
  }
}
```

- Sie können die von `upload_image` zurückgegebene `image_url` direkt übergeben.
- Wird die Option weggelassen, bleibt der Beitragstext unverändert.
- Wird sie erneut angegeben, ersetzt sie einen zuvor von diesem MCP eingefügten Block.
- Wird bei einer Aktualisierung `content` weggelassen, wird der Block auf den vorhandenen Beitragstext angewendet.

### Seiten

| Tool | Zweck | Erforderlich | Wichtige Optionen |
| --- | --- | --- | --- |
| `list_pages` | Seiten auflisten, 10 pro Seite | `blog_id` | `hatena_id`, `page`, `include_html` |
| `get_page` | Eine Seite abrufen | `blog_id`, `page_id` | `hatena_id`, `include_html` |
| `create_page` | Eine Seite erstellen | `blog_id`, `title`, `content`, `custom_url` | `content_type`, `draft`, `preview`, `updated` |
| `update_page` | Eine Seite partiell aktualisieren | `blog_id`, `page_id` | `title`, `content`, `draft`, `preview`, `custom_url`, `touch_updated`, `expected_edited` |
| `delete_page` | Eine Seite löschen | `blog_id`, `page_id` | `hatena_id` |

### Kategorien und Bilder

| Tool | Zweck | Erforderlich | Wichtige Optionen |
| --- | --- | --- | --- |
| `list_categories` | Kategorien und ihren Fixierungsstatus auflisten | `blog_id` | `hatena_id` |
| `get_image` | Metadaten eines Fotolife-Bildes abrufen | `image_id` | — |
| `upload_image` | Ein Bild hochladen und seine URL sowie die Blog-Syntax zurückgeben | `title`, `content_type`, `data_base64` | `folder` (Standard: `Hatena Blog`) |

Der offizielle Fotolife-Feed listet den privaten Ordner „Hatena Blog“, der über den Blog-Editor befüllt wird, nicht auf. Deshalb stellt dieser Server kein Tool zum Auflisten von Bildern bereit.

## Limits und Wiederholungen

- Hatena-XML-Antwort: 8 MiB
- Fehler-Body: 16 KiB
- Beitragstext: 4 MiB
- Dekodiertes Bild: 10 MiB
- Kategorien: 100 Einträge, je 256 Zeichen
- Upstream-Timeout: 30 Sekunden pro Versuch
- Automatische Wiederholung: nur für idempotente Methoden wie GET, PUT und DELETE, niemals für POST
- Der Abbruch einer MCP-Anfrage wird an Upstream-Anfragen und Wartezeiten zwischen Wiederholungen weitergegeben. Bereits gesendete Schreibvorgänge lassen sich nicht zurückrollen.
- Timeouts beim Response-Body und Verbindungsfehler werden als Netzwerkfehler gemeldet, getrennt von übergroßen Bodys und XML-Parsing-Fehlern.

## Entwicklung und Verifikation

```sh
pnpm install --frozen-lockfile
pnpm verify
npm pack --dry-run --json
```

`pnpm verify` führt Biome, TypeScript, Vitest mit aktivierter Coverage, eine stdio-Verbindung gegen die gebaute CLI sowie E2E-Prüfungen für Bildlimits, Abbruch, partielle Aktualisierungen und Fehler beim Response-Body aus. Führen Sie nach dem Build `node scripts/smoke-behavior.mjs --report <output.json>` aus, um die Ergebnisse zu speichern. Architektur und Invarianten finden Sie in [DESIGN.md](./DESIGN.md).

## Sicherheit

- Entfernen Sie Umgebungswerte, bevor Sie eine MCP-Client-Konfiguration oder einen Wrapper weitergeben.
- Logs enthalten weder Authorization, API-Schlüssel, Upstream-Response-Bodys noch beliebige Ausnahmemeldungen.
- Wenn ein Schlüssel offengelegt wurde, erneuern Sie ihn in den AtomPub-Einstellungen von Hatena Blog.
- Es handelt sich um einen lokalen stdio-Prozess, dennoch ist Schutz auf Betriebssystemebene erforderlich, und zwar gegen andere Prozesse desselben Benutzers sowie gegen die Offenlegung von Client-Konfigurationsdateien.

## Lizenz

MIT © Keisuke Nishitani
