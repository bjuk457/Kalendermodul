# Kalendermodul

Schlichte Listen-Kalenderkarte für Home Assistant. Sie zeigt mehrere Kalender zusammen an, färbt die Termine nach Kalender ein und gruppiert sie nach Tagen. Der nächste Termin steht oben, links groß das Datum, rechts der Titel in der Farbe seines Kalenders und darunter die Zeit.

## Kalender-Quellen

Die Karte liest alle `calendar.*`-Entitäten. Die Quellen bindest du in HA unter **Einstellungen → Geräte & Dienste → Integration hinzufügen** ein:

| Quelle | Integration |
|---|---|
| ICS-Datei / ICS-URL | **Remote Calendar** |
| Google Kalender | **Google Calendar** |
| CalDAV (Nextcloud, iCloud, …) | **CalDAV** |
| Lokal in HA | **Local Calendar** |

## Installation (HACS)

1. HACS → ⋮ → **Benutzerdefinierte Repositories**
2. URL `https://github.com/bjuk457/kalendermodul`, Typ **Dashboard** → Hinzufügen
3. „Kalendermodul“ öffnen → **Herunterladen**, danach Browser neu laden

## Konfiguration

Die Karte lässt sich über den visuellen Editor („Kalendermodul“) oder per YAML einrichten:

```yaml
type: custom:kalendermodul-card
title: Termine
days: 14            # Tage im Voraus (Standard 14)
entities:
  - entity: calendar.familie
    color: "#e53935"
  - entity: calendar.mullkalender
    color: "#43a047"
  - calendar.feiertage   # ohne Farbe -> automatische Farbe
```

Im visuellen Editor wählst du die Farbe aus 20 Regenbogenfarben sowie Weiß und drei Grautönen im Dropdown. Per YAML geht weiterhin jeder CSS-Farbwert (`#hex`, `rgb()`, `var(--red-color)`). Die Termine werden alle 5 Minuten neu geladen.

## Entwicklung

`node test.js` prüft die Gruppierungslogik.
