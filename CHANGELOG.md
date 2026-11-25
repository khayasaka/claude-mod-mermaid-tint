# Changelog

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
