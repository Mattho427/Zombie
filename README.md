# Dead Zone – Zombie Survival

Ein Top-Down-Survival-Shooter im Browser: Überlebe in einer verlassenen Stadt so viele Zombie-Wellen wie möglich.
Reines HTML5 Canvas + JavaScript, ohne Abhängigkeiten oder Build-Schritt.

## Starten

`index.html` direkt im Browser öffnen. Alternativ einen lokalen Server starten:

```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

## Steuerung

| Taste | Aktion |
| --- | --- |
| `W` `A` `S` `D` / Pfeiltasten | Bewegen |
| Maus | Zielen & Schießen |
| `Shift` | Sprinten (verbraucht Ausdauer) |
| `R` | Nachladen |
| `1`–`4` / Mausrad / `Q` | Waffe wechseln |
| `E` | Barrikade bauen (3 Schrott) |
| `P` / `Esc` | Pause |
| `M` | Ton an/aus |
| `Enter` | Spiel starten / neu starten |

Auf Touch-Geräten erscheinen zwei virtuelle Sticks (links bewegen, rechts zielen und feuern) sowie Tasten für Nachladen, Bauen und Waffenwechsel.

## Features

- **Prozedurale Stadt**: Straßenraster, Gebäude, Autowracks und Parks, bei jedem Spiel neu generiert.
- **Wellensystem**: Jede Welle bringt mehr und stärkere Zombies. Alle 5 Wellen erscheint ein **Tank**.
- **6 Zombie-Typen**:
  - *Walker*: langsam und zahlreich
  - *Runner*: schnell und schwach
  - *Brute*: zäh und schlägt hart zu
  - *Spitter*: hält Abstand und spuckt Säure
  - *Boomer*: explodiert und reißt auch andere Zombies mit
  - *Tank*: Boss, der auf dich zustürmt
- **4 Waffen**: Pistole (unendlich Munition), Schrotflinte, Sturmgewehr und Scharfschützengewehr (durchschlägt mehrere Ziele).
- **Tag-/Nacht-Zyklus**: Nachts ist es dunkel, nur die Taschenlampe hilft. Zombies sind dann schneller und kommen häufiger.
- **Pathfinding**: Zombies finden über ein Flow-Field den Weg um Gebäude herum. Schüsse locken schlafende Zombies an.
- **Barrikaden**: Aus Schrott gebaut, halten Zombies auf, bis sie zerschlagen werden.
- **Perks**: Nach jeder Welle wählst du eine von drei Verbesserungen (mehr Leben, Schaden, Tempo, Regeneration, …).
- **Combo-Multiplikator**: Schnelle Kills in Folge geben bis zu x5 Punkte.
- **Minimap, Partikel, Blutspuren, Bildschirmwackeln** und synthetisierte Soundeffekte über die WebAudio-API.
- **Rekord** wird lokal im Browser gespeichert.

## Projektstruktur

```
index.html        Seite, HUD und Menüs
css/style.css     Styles für HUD, Menüs und Touch-Steuerung
js/utils.js       Mathe-/Kollisionshilfen, localStorage-Wrapper
js/input.js       Tastatur, Maus und Touch-Sticks
js/weapons.js     Waffendefinitionen und Munitionslogik
js/world.js       Kartengenerierung, Kollision, Raycasts, Flow-Field
js/entities.js    Spieler, Zombies, Projektile, Pickups
js/effects.js     Partikel, Decals, Texte, Sound-Synthese
js/render.js      Canvas-Rendering inkl. Licht/Nacht und Minimap
js/director.js    Wellen, Spawns, Loot und Perks
js/game.js        Spielschleife, Zustände, Treffer und HUD
```
