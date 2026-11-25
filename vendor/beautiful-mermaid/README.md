# beautiful-mermaid (bundled)

`index.mjs` is `dist/index.js` built from commit `c098ee1` of the `mermaid-tint` branch of [khayasaka/beautiful-mermaid](https://github.com/khayasaka/beautiful-mermaid/tree/mermaid-tint), a fork of [lukilabs/beautiful-mermaid](https://github.com/lukilabs/beautiful-mermaid) 1.1.3 with [pull request #150](https://github.com/lukilabs/beautiful-mermaid/pull/150) (pie, timeline, mindmap and quadrant charts) and fixes to the timeline and mindmap box drawing. `LICENSE` is beautiful-mermaid's MIT license.

It is bundled here rather than installed: Claude Code installs a plugin's packages only from the npm registry, and the fork isn't published there. Its own dependencies, `elkjs` and `entities`, are installed from npm as this plugin's dependencies.

To update it, build the fork (`bun install --ignore-scripts`, then `npx tsup`), copy `dist/index.js` here as `index.mjs`, and change the commit above.
