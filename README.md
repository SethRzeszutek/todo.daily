# todo.daily

A single-file daily to-do list. High-contrast, keyboard-driven, and stored as
plain JSON on your own disk — no account, no server, no dependencies.

**[Open it → sethrzeszutek.github.io/todo.daily](https://sethrzeszutek.github.io/todo.daily/)**

## How it stores your list

Everything lives in one JSON file that you choose:

- **Open JSON** picks an existing file and links it. Contents are preserved.
- **New JSON** creates one (or replaces the file you pick).
- **Import** merges another file's items in without linking or overwriting.

Edits are written to `localStorage` immediately and to the linked file on a
short debounce. Linking needs the File System Access API — Chrome, Edge, or
another Chromium browser. Elsewhere the list still works and persists in the
browser; use **Download** to get the JSON out.

Display settings are kept per browser under their own `localStorage` key, so
they follow the browser rather than the file, and opening someone else's list
will not change how yours looks.

## Keyboard

`↑ ↓` move between rows, `← →` between the controls on a row, `⏎` adds or
activates, `⇧⏎` selects, `E` edits, `T` cycles a mark, `1`–`8` picks one,
`⌫` deletes, `U` undoes, `N` new, `C` config, `⌥←`/`⌥→` change day,
`⌥W` day/week, `⌥T` theme, `⎋` cancels. The legend under Config lists these
in the app, and `Hints` hides them.

## Publishing your own copy

`index.html` is self-contained, so GitHub Pages needs nothing built:

1. Push this folder to a repository.
2. Settings → Pages → deploy from branch, root of `main`.

Pages is served from a different origin to `file://`, so a hosted copy starts
with an empty list — link or import your JSON there.

`todo.json` is gitignored. Keep it that way unless you want your tasks public.

## Development

    node dev/test.js      # regression suite, exits non-zero on failure
    dev/reload.sh         # force-reload the open tab in Chrome

The suite runs the page's scripts against a small DOM stub — no browser or
package install. Effects that only exist once painted (the CRT warp's hit
correction in particular) are verified separately against real Chrome; see the
comments around `WARP_FIELD` in `index.html`.
