# Contributing

Bug reports and ideas are welcome. Pull requests are welcome too, but this is maintained in spare time, so replies and reviews may take a while.

## Reporting a problem

Open an issue with the bug report form, and include a screenshot when something is drawn wrong. Report security problems privately instead, as [SECURITY.md](SECURITY.md) describes.

## Working on the code

1. Fork the repository, clone your fork, and install the renderer's packages with `npm ci --ignore-scripts`.
2. Start Claude Code with your clone loaded: `claude --plugin-dir .`. It reloads the hooks module when you save, and the first load writes `tsconfig.json` and the type declarations in `.claude-plugin/types/`.
3. Run the checks before you open a pull request:
   - `claude plugin test`
   - `node --test tests/*.test.mjs`
   - `claude plugin validate --strict .claude-plugin/plugin.json`
   - `npx -p typescript@5 tsc --noEmit`

Keep a pull request to one change, add a test that fails without it, and update both READMEs (`README.md` and `README.ja.md`) when users will notice it. A README change in English alone is fine; the Japanese one can follow.
