# Mermaid Tint

English | [日本語](README.ja.md)

Mermaid Tint draws the Mermaid diagrams in Claude's replies right inside your terminal. It is a Claude Code [mod](https://code.claude.com/docs/en/plugins/mods/overview). When Claude writes a ` ```mermaid ` code block, you see the diagram in its place, with labels at the size of the text around it, instead of the source. In terminals that can't show pictures, the same diagram is drawn with Unicode box drawing instead.

![A Claude Code reply with a flowchart, a sequence diagram and a state diagram drawn as pictures, each box with its own outline color and a light fill](docs/screenshot.png)

*gooztty on Windows, with the `nord-light` theme and BIZ UDPGothic for labels.*

It is a fork of [dazebug/mermaid-inline](https://github.com/dazebug/mermaid-inline) 0.1.3 that works on Windows and fixes how diagrams look and how their pictures are cleaned up. The original author's credit and the MIT license carry over. The first release is 0.6.0; versions 0.2.0 to 0.5.2 were unpublished local versions.

## What's different from mermaid-inline

- **Works on Windows**
  - Label fonts are also looked up in the Windows font folders (`~\AppData\Local\Microsoft\Windows\Fonts` and `%WINDIR%\Fonts`). mermaid-inline looked only in the macOS and Linux folders.
  - On Windows without `HOME`, `USERPROFILE` is used as the home folder.
- **Draws in a Windows terminal when Claude Code runs in WSL**: diagram pictures are passed as data rather than as file paths. mermaid-inline passed paths, which a Windows terminal can't open in WSL, so it drew empty frames. Pictures over 2 MiB are still passed as paths.
- **A color for each box**: each box of a flowchart, state, sequence, class or ER diagram gets its own outline color from the theme, with a light fill of that color. Set `box_colors` to `false` for the theme's single box color, as in mermaid-inline.
- **Pictures don't pile up**: diagram pictures are kept in the session's scratchpad, so Claude Code removes them with old sessions. Sessions without a scratchpad (API key logins, Bedrock and the like) use the cache folder as mermaid-inline did, and pictures there older than `cleanupPeriodDays` (30 days by default) are removed at session start.
- **Edges and arrow heads drawn right**
  - Small steps (under 8 px) that could appear in an edge just before its arrow head are removed.
  - Arrow heads are rewritten in a form resvg can read. In mermaid-inline, class diagram arrows pointed right even on downward edges, inheritance triangles, aggregation and composition diamonds and the start of `<-->` edges were missing, and leftward messages in sequence diagrams pointed right.
- **More kinds of diagrams**: `pie`, `timeline` and `mindmap` are drawn too, as pictures and in box drawing. mermaid-inline left them as code.
- **Box drawing stays in its columns with CJK labels**: letters that take two cells in the terminal, such as Chinese, Japanese and Korean script and wide emoji, are laid out as two cells. In mermaid-inline, the box lines after them landed a column short.
- **Tells you when packages are missing**: when the renderer's npm packages can't be found, Claude is told on the next prompt, and `/mermaid-tint` shows it.

## Requirements

- Claude Code 2.1.331 or later, in a terminal session (declared with `engines` in `plugin.json`)
- Node.js 18 or later with npm on your `PATH`: Claude Code uses npm to install the renderer's packages when it installs the plugin, and the mod runs its renderer with `node`
- For pictures, a terminal that shows them through the kitty graphics protocol: Ghostty, cmux (built on Ghostty) or kitty, not inside tmux, which does not pass the pictures through. Everywhere else, including iTerm2, WezTerm, Terminal.app and Windows Terminal, you get the box drawing
- macOS, Linux or Windows

In the desktop app, VS Code and `claude -p`, the mod stays out of the way: replies are drawn as usual.

## Install

In a Claude Code terminal session, type this at the prompt:

```
/plugin install mermaid-tint --marketplace khayasaka/claude-mod-mermaid-tint
```

Answer `y` to add the marketplace, then choose a scope (the user scope is first).

From a shell:

```
claude plugin install mermaid-tint --marketplace khayasaka/claude-mod-mermaid-tint
```

Start a new session, or run `/reload-plugins` in an open one. `/plugin` then lists `mermaid-tint` among the active mods, and `/mermaid-tint` shows whether it draws pictures in this terminal, and the font, colors and design it uses.

If mermaid-inline is installed, uninstall it first: with both installed, two mods try to draw the same diagrams.

Mods are an early access feature of Claude Code, and their API may change from release to release. This mod was tested on Claude Code 2.1.331.

## Update

```
claude plugin marketplace update claude-mod-mermaid-tint
claude plugin update mermaid-tint@claude-mod-mermaid-tint
```

Then restart Claude Code. The mod does not update itself.

## On Windows

- **Terminal**: on Windows, pictures have been tested only in gooztty, a Windows fork of Ghostty. Claude Code draws pictures only in terminals that name themselves kitty or Ghostty, so gooztty needs both of these:
  - Set `mode` to `on` (`auto` draws pictures only in terminals it recognizes as Ghostty or kitty).
  - Start Claude Code with the environment variable `CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1`.

  In a terminal that can't show pictures, such as Windows Terminal, either one leaves empty frames where the diagrams should be. Set them only in gooztty, for example in your PowerShell profile when `$Env:TERM_PROGRAM -eq 'gooztty'`.
- **Font**: on Windows, `font` set to `auto` finds no default font. Set `font` to the name of an installed font, such as `Segoe UI`, `BIZ UDPGothic` or `Yu Gothic UI`. Labels in Japanese and other CJK scripts need a font that has those characters.
- **WSL**: to run Claude Code in WSL inside gooztty, add `TERM_PROGRAM/u` to `WSLENV`, so the Windows variable `TERM_PROGRAM` reaches WSL. On Linux, install `fonts-noto-cjk` or similar for CJK labels.

## Diagrams it draws

Flowcharts (`graph` and `flowchart`, in any direction), `sequenceDiagram`, `stateDiagram-v2`, `classDiagram`, `erDiagram`, `xychart-beta` (bar and line charts), `pie`, `timeline` and `mindmap`. A block of another kind, such as `gantt` or `quadrantChart`, or one that doesn't parse, stays a code block, as Claude wrote it. Every kind is drawn both as a picture and in box drawing; `quadrantChart`, which the renderer draws as a picture but not yet well in box drawing, is left as code in both.

A diagram is drawn when its code block is closed and stands at the top level of the reply or in a list item. One in a list item is drawn at the item's indent. One inside a block quote stays code, and so does one still streaming in, until its closing fence arrives. A diagram wider than the terminal is shrunk to fit, and one taller than the screen is shrunk toward the screen's height, its labels no smaller than 60% of their size.

Math in a label, written between `$` signs as in LaTeX (or `$$`, `\(…\)`, `\[…\]`), is drawn as the Unicode text [LaTeX Inline](https://github.com/dazebug/latex-inline) writes math as where it shows no pictures: `$x^2$` as x², `$\alpha \le \beta$` as α ≤ β, `$\frac{a+b}{c}$` as (a + b)/c. A `$` that doesn't open math, as in `$5`, stays as written, and so does a formula whose text would change the diagram, such as `|x|` in an edge label, where the bars would end the label.

The mod adds a short section to Claude's system prompt, only in sessions where it draws pictures, that says Mermaid blocks are shown as diagrams, which kinds are drawn, and to keep diagrams small with short labels. Set `teach_claude` to `false` to leave the system prompt alone; Claude then draws diagrams only when it writes them on its own or you ask for one.

It works beside [LaTeX Inline](https://github.com/dazebug/latex-inline): in a reply that holds both diagrams and math, each mod draws its own part, whichever runs first. Use LaTeX Inline 0.3.3 or later with it, so the two leave the same blank rows between their parts.

## Design

The default theme, `auto`, draws a diagram on your terminal's own background in its text color, with Claude's orange for arrow heads, so the picture looks like part of the terminal. Pick one of beautiful-mermaid's themes instead and the diagram is drawn on that theme's background, as a card, and change any single color with `colors`:

![The same flowchart in four designs: auto on a dark terminal, and tokyo-night, github-light and catppuccin-latte as cards, each box with its own outline color and a light fill](docs/themes.png)

*From the top left: `auto` (dark terminal), `tokyo-night`, `github-light` and `catppuccin-latte`, with Segoe UI for labels.*

## Options

Set options with `/plugin configure mermaid-tint@claude-mod-mermaid-tint` or in the `/config` panel. The values are yours alone: they are kept in your own settings, under `pluginConfigs`.

| Option | Default | What it does |
| :- | :- | :- |
| `mode` | `auto` | `auto` draws pictures in Ghostty, cmux and kitty outside tmux, and box drawing in other terminals. `on` always draws pictures, `text` always draws box drawing, `off` leaves the code blocks as written. |
| `teach_claude` | `true` | Adds the diagram section to the system prompt where the mod draws pictures. |
| `theme` | `auto` | `auto`, or one of `zinc-light`, `zinc-dark`, `tokyo-night`, `tokyo-night-storm`, `tokyo-night-light`, `catppuccin-mocha`, `catppuccin-latte`, `nord`, `nord-light`, `dracula`, `github-light`, `github-dark`, `solarized-light`, `solarized-dark`, `one-dark`. |
| `colors` | (none) | Colors that win over the theme's, as `key=#rrggbb` pairs separated by spaces: `bg` (background), `fg` (text), `line` (edges), `accent` (arrow heads, highlights, chart series), `muted` (secondary text), `surface` (node fill), `border` (node outline). For example `accent=#7aa2f7 line=#5c6370`. |
| `box_colors` | `true` | Gives each box its own outline color from the theme, with a light fill of that color. `false` keeps the theme's single box color. A box given its own `style` in the diagram keeps it. |
| `font` | `auto` | The label font: `auto` is Helvetica Neue on macOS and DejaVu Sans, Noto Sans or Liberation Sans on Linux; or the family name of a font installed on your machine. Hangul and other CJK text falls back to a system font that has it. |
| `text_scale` | `1` | Label size relative to your terminal's text. |
| `node_path` | `node` | The Node.js executable that runs the renderer. |
| `font_metrics` | `auto` | `auto` measures your terminal font at session start (below). `manual` always uses the next two options. |
| `cell_aspect` | `2.125` | Your terminal cell's height divided by its width, in pixels. |
| `line_height` | `1.308` | The cell height in ems of your terminal font. |

`/mermaid-tint` names an option value it could not use, such as a theme it doesn't know or a malformed color.

The fill is 14% of the box color on a light background and 20% on a dark one. With the `auto` theme, or a theme without its own box colors, the colors come from GitHub Light on a light background and Catppuccin Mocha on a dark one.

## Matching your terminal

The terminal stretches each picture to fill the cells it is given, so the mod has to know the shape of a cell to keep diagrams undistorted, and how tall the cell is in ems of the font to draw labels at the size of your text. With `font_metrics` set to `auto`, the default, it works these out at the start of each session the way [LaTeX Inline](https://github.com/dazebug/latex-inline#matching-your-terminal-font) does: it finds the font your terminal is set to (the first `font-family` in Ghostty's config, with Ghostty's built-in JetBrains Mono when none is set, or `font_family` in `kitty.conf`), reads its metrics from the font file and sizes a cell the way the terminal does. Set `font_metrics` to `manual` and enter `cell_aspect` and `line_height` yourself when the measured cell is off, as it is when you zoom the font or adjust the cell in your terminal's config.

The `auto` theme takes your terminal's background and text colors from its config too: Ghostty's `background` and `foreground`, or those of its `theme` (a `light:…,dark:…` pair follows macOS's dark mode), with Ghostty's defaults when neither is set; kitty's `background` and `foreground`, following `include` lines such as the one `kitten themes` writes. When it can't tell, it uses colors that fit Claude Code's dark or light theme. If the background is off, the boxes behind edge labels show as patches of the wrong color: set `bg` in `colors` to your terminal's background.

## Box drawing

Where pictures can't be shown, each diagram is drawn with Unicode box drawing, by beautiful-mermaid's text renderer:

```
┌────────────┐    ┌────────────┐    ┌──────────┐
│ Storefront │    │ Orders API │    │ Payments │
└──────┬─────┘    └──────┬─────┘    └─────┬────┘
       │                 │                │
       │  POST /orders   │                │
       │─────────────────▶                │
       │                 │                │
       │                 │  Charge card   │
       │                 │────────────────▶
       │                 │                │
       │                 │    Charged     │
       │                 ◀╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌│
       │                 │                │
       │   201 Created   │                │
       ◀╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌│                │
       │                 │                │
┌──────┴─────┐    ┌──────┴─────┐    ┌─────┴────┐
│ Storefront │    │ Orders API │    │ Payments │
└────────────┘    └────────────┘    └──────────┘
```

A drawing wider than the terminal can't be shrunk, so that diagram stays a code block. Box colors are not drawn in box drawing.

Letters that take two cells in the terminal (Chinese, Japanese and Korean script, fullwidth forms and wide emoji, by Unicode's East Asian Width) are given two cells, so the box lines after them stay in their columns. Ambiguous-width symbols such as ○ and ★ are given one cell, so in a terminal set to draw them two cells wide, the lines after them still land a column off.

## Privacy

Mermaid Tint collects no data and sends nothing off your machine: it has no server and makes no network requests. Diagrams are drawn by a local `node` process and kept as pictures in the session's scratchpad or your cache folder. Everything it runs, reads and writes is listed below.

## What it runs, reads and writes

- **Runs**
  - `node bin/render.mjs` from the plugin folder once per batch of new diagrams, with their Mermaid source on its standard input. It lays each diagram out with beautiful-mermaid and, for pictures, rasterizes it to PNG with [resvg](https://github.com/RazrFalcon/resvg).
  - `node bin/terminal.mjs` once at session start, where it draws pictures in Ghostty, cmux or kitty. On macOS it runs `defaults read -g AppleInterfaceStyle` when your Ghostty theme depends on dark mode.
  - `node bin/prune.mjs` once at session start, only when the cache folder holds old pictures. It removes only `.png` and `.json` files whose names hold no path separator, inside the folder it is given.
  - Nothing else is run. All start through Claude Code's `$.process.run`, as an argument list with no shell, with the `node` that `node_path` names; the terminal check is stopped after 10 seconds and a render after 60. They run as a separate `node` process because Claude Code runs the hooks module itself with no Node.js APIs or WebAssembly and lets it import only its own files, so the npm packages that lay out and draw the diagrams cannot load there.
- **Writes**: the PNG pictures and a small JSON record per diagram in `mermaid-tint/v2` in the session's scratchpad, or, in sessions without one, in `$XDG_CACHE_HOME/mermaid-tint/v2` (`~/.cache/mermaid-tint/v2` by default). Delete the cache folder at any time to clear it.
- **Reads**
  - Those files
  - Your terminal's config: Ghostty's `config` files in `~/.config/ghostty` and, on macOS, `~/Library/Application Support/com.mitchellh.ghostty`, the files they include with `config-file`, and the theme file their `theme` names, from `~/.config/ghostty/themes` or Ghostty's or cmux's own theme folder; or `~/.config/kitty/kitty.conf` and the files it includes
  - The headers of the font files in your font folders, to find and measure the terminal font
  - The label fonts it draws with
  - Your environment's `TERM`, `TERM_PROGRAM`, `KITTY_WINDOW_ID`, `TMUX`, `HOME`, `USERPROFILE`, `XDG_CACHE_HOME`, `XDG_CONFIG_HOME`, `GHOSTTY_RESOURCES_DIR`, `WINDIR` and `SystemRoot`
  - Claude Code's `theme` and `cleanupPeriodDays` settings
- **Network**: none at run time. beautiful-mermaid writes a web font `@import` into each SVG, which the renderer removes before drawing; resvg is given local font files and fetches nothing. Claude Code downloads the npm packages pinned in `package-lock.json` (`@resvg/resvg-js`, `elkjs`, `entities` and their dependencies) when it installs the plugin. beautiful-mermaid is bundled in `vendor/beautiful-mermaid`, built from the fork [khayasaka/beautiful-mermaid](https://github.com/khayasaka/beautiful-mermaid/tree/mermaid-tint).
- **Sends**: nothing leaves your machine. The diagram sources go to the local `node` renderer on its standard input, and the pictures come back as files.
- **Credentials**: none are read.
- **Hooks**
  - `session.start` works out how this terminal shows diagrams, measures the font and colors for pictures, registers `/mermaid-tint`, and clears old pictures from the cache folder.
  - `classic.SessionStart` takes the session's scratchpad folder.
  - `command.run` answers `/mermaid-tint`.
  - `prompt.compose` adds the diagram section described above.
  - `prompt.submit` adds a note for Claude, once, when the renderer's packages are missing.
  - `ui.render`, on assistant messages only, redraws a reply that holds a Mermaid block: its diagrams are drawn by the mod, the text around them is handed back to Claude Code (and to any other plugin, such as LaTeX Inline), and the stored message is left as it was.
- **Changes to Claude**: the diagram section in the system prompt described above, only where the mod draws pictures, and the `/mermaid-tint` command.

## When a diagram can't be drawn

- A diagram of a kind the renderer doesn't draw, or one it can't parse, stays a code block, and the rest of the reply is still drawn. beautiful-mermaid reads node ids written in ASCII letters and digits; a flowchart whose ids are written in another script draws nothing, so it stays code (labels may be in any script).
- If the renderer can't run at all (no `node`, missing packages), every diagram stays a code block, and the mod tries again in the next session.
- While a new diagram renders, its code block shows for a moment and is then replaced. When the terminal's width changes, the diagram is drawn again for the new width.

## Limitations

- Copying a reply out of the terminal copies the picture placeholders, not the Mermaid source.
- beautiful-mermaid lays diagrams out its own way, which differs from mermaid.js in places, such as the spacing and where edge labels sit, and it may not read the newest syntax.
- In a class diagram, a second relation between the same two classes (such as `A --> B` and `A <--> B`) is not drawn by beautiful-mermaid.
- Claude's thinking, shown with ctrl+o, keeps its code blocks as written: Claude Code gives mods no way to redraw it.
- Where Claude Code puts a header above each message, as in the ctrl+o transcript view, a reply that holds a diagram can have a blank row too many under the header and none above the text after a diagram: Claude Code leaves those rows out there, and a mod cannot tell that view from the normal one.

## Troubleshooting

Run `/mermaid-tint` first: it says whether the mod draws pictures or box drawing in this terminal and, for pictures, which font and colors it found and the design it uses. For more, start Claude Code with `claude --debug` and search the debug log for `mermaid-tint`. A line ending in `not loaded:` says why the mod did not load, and a `ui.render (AssistantMessage) refused` line names a drawing Claude Code rejected.

## Development

Load your clone for one session with `claude --plugin-dir ./claude-mod-mermaid-tint`; Claude Code doesn't install the packages for a plugin loaded in place, so run `npm ci --ignore-scripts` in the clone first. `claude plugin test` runs the parser and hook tests, and `node --test tests/*.test.mjs` the renderer, color and font measuring tests.

## Acknowledgements

- Forked from dazebug's [mermaid-inline](https://github.com/dazebug/mermaid-inline).
- Diagrams are laid out by [beautiful-mermaid](https://github.com/lukilabs/beautiful-mermaid) from Craft, whose text renderer is based on Alexander Grooff's [mermaid-ascii](https://github.com/AlexanderGrooff/mermaid-ascii), with [ELK](https://github.com/kieler/elkjs) for layout, and rasterized by [resvg](https://github.com/RazrFalcon/resvg). The pie, timeline and mindmap renderers come from Daniele Rolli's [pull request #150](https://github.com/lukilabs/beautiful-mermaid/pull/150) to beautiful-mermaid, which the fork [khayasaka/beautiful-mermaid](https://github.com/khayasaka/beautiful-mermaid/tree/mermaid-tint) builds on with fixes to the timeline and mindmap box drawing.
- The terminal cell is measured the way [Ghostty](https://github.com/ghostty-org/ghostty) (MIT) computes it in `src/font/Metrics.zig`, with code shared with [LaTeX Inline](https://github.com/dazebug/latex-inline).
- Math in labels is turned into Unicode text by a copy of LaTeX Inline's converter, `hooks/tex.ts`.
- The cache file names come from [cyrb53](https://github.com/bryc/code/blob/master/jshash/experimental/cyrb53.js), bryc's public-domain string hash.
- The box colors follow [NahumLitvin/prismantis](https://github.com/NahumLitvin/prismantis), which colors each box of its text diagrams.

## License

MIT, see [LICENSE](LICENSE). The renderer's packages keep their own licenses: beautiful-mermaid (MIT, bundled with its license in `vendor/beautiful-mermaid`), elkjs (EPL-2.0), entities (BSD-2-Clause) and resvg-js (MPL-2.0).
