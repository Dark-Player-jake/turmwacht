# Turmwacht

[Deutsche Fassung](README.de.md)

**A roguelike tower defense game in the browser.** Every run has a new, randomly generated map.
Every five waves you pick one of three blessings, and the rest of the run builds on that choice.
The waves never end, and your best score is saved locally.

No build step, no dependencies, no audio files.

<!-- TODO before going public: add docs/screenshot.png and a live demo link (e.g. GitHub Pages). -->

> [!NOTE]
> The user interface is in German for now. Contributions for an English UI are welcome.

## Features

- **4 towers**, each with 3 upgrade levels and a target mode (first, strongest, nearest): bow,
  cannon (area damage, cannot hit flyers), frost (slows), lightning (chain damage, ignores armor).
- **8 enemy types:** runner, infantry, swarm, flyer (straight line instead of the path), tank
  (armor), healer (heals neighbors), splitter (breaks into a swarm), colossus (boss every 10 waves).
- **9 blessings**, e.g. interest, bounty, overload, permafrost.
- **Sound** is fully synthesized with the Web Audio API.
- Next-wave preview, 2× speed, keyboard controls, light and dark theme from your system setting.

## Quick start

The game uses ES modules, so it has to be served over HTTP (opening `index.html` via `file://`
does not work):

```bash
git clone https://github.com/Dark-Player-jake/turmwacht.git
cd turmwacht
python3 -m http.server 8000
```

Then open <http://localhost:8000>. To play or share a specific map, add `?seed=1234` to the URL.

## Controls

| Key | Action |
|---|---|
| `1`–`4` | Select a tower |
| Click on a tile | Build (or focus the board and use arrow keys + `Enter`) |
| Click on a tower | Select it |
| `U` / `S` | Upgrade / sell (70 % refund) |
| `Space` | Next wave |
| `F` / `M` | Speed / sound |
| `Esc` | Deselect |

## Development

```bash
node --test
```

The tests cover path generation (300 seeds: connected, never touching itself), building, upgrading
and selling, armor, frost, splitters, blessing choice, wave growth and a long run for numeric
stability.

Balance was measured with a simple bot (greedy building and upgrading, always the first blessing):
over 12 maps it reaches wave 24 on average (11 to 33).

| File | Purpose |
|---|---|
| `game.mjs` | Game logic without DOM (map, waves, towers, enemies, blessings) |
| `audio.mjs` | Sound synthesis |
| `main.mjs` | Canvas rendering, input, UI |

## Contributing

Issues and pull requests are welcome. Please run `node --test` before you open a pull request and
keep the game free of dependencies and external resources.

## License

<!-- TODO: license not chosen yet (MIT proposed). Add a LICENSE file before making the repo public. -->
Not decided yet.
