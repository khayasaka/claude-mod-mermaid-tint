# Changelog

## 0.6.2

- Keeps box drawing in its columns where labels hold Chinese, Japanese or Korean script, fullwidth forms or wide emoji. beautiful-mermaid's text renderer gave these letters one cell where the terminal draws two, so the box lines after them landed a column short. Each such letter is now laid out as two one-cell stand-ins and put back afterwards.
- Counts more letters as two cells wide: the ideographs beyond the BMP (U+20000 to U+3FFFD, such as 𠮷) and the emoji and symbols from U+2300 to U+2BFF that Unicode's East Asian Width marks Wide (✅, ⌛, ☕, ⭐ and the like). This also sizes pictures and box drawing that hold them correctly, and uses the CJK fonts for labels with those ideographs.

## 0.6.1

- Joins the cache folder with the separator its base folder already uses, so on Windows `/mermaid-tint` shows `C:\...\scratchpad\mermaid-tint\v2` instead of mixing `\` and `/`.

## 0.6.0

- First release, forked from [dazebug/mermaid-inline](https://github.com/dazebug/mermaid-inline) 0.1.3. Versions 0.2.0 to 0.5.2 were unpublished local versions.
- Renamed to `mermaid-tint`: the command is `/mermaid-tint`, and diagrams are cached under `mermaid-tint/v2`. Uninstall `mermaid-inline` before installing this plugin, or both draw the same diagrams.
- Declares the supported Claude Code versions in `plugin.json` (`engines["claude-code"]`: `>=2.1.331`, the version this release was tested on).
- Works on Windows: label fonts are also looked up in the Windows font folders, and `USERPROFILE` is used as the home folder when `HOME` is not set.
- Draws in a Windows terminal when Claude Code runs in WSL: diagram pictures up to 2 MiB are passed as data rather than as file paths, which the Windows terminal cannot open.
- Gives each box of a flowchart, state, sequence, class or ER diagram its own outline color from the theme, with a light fill of that color. The new option `box_colors` (default `true`) turns this off.
- Keeps the diagram pictures in the session's scratchpad, so Claude Code removes them with the session. Sessions without a scratchpad still use the cache folder, where pictures older than `cleanupPeriodDays` (30 days by default) are removed at session start.
- Removes the small steps (under 8 px) that beautiful-mermaid can leave in an edge just before its arrow head.
- Fixes arrow heads that resvg drew unrotated: class diagram arrows on downward edges, inheritance triangles, aggregation and composition diamonds, the start of `<-->` edges, and leftward messages in sequence diagrams.
- Tells Claude, once, when the renderer's npm packages are missing, and shows it in `/mermaid-tint`.

See the README for details.
