# modules/quran

Isolated, read-only Quran text service (X1). Source: Tanzil Project, Uthmani, Hafs, v1.1, CC BY 3.0 (see `docs/licenses/tanzil-terms.md`). **The text may not be changed.**

- `data/quran-uthmani.txt` – raw Tanzil download, byte-exact (never edit, never reformat; git does not touch line endings).
- `data/checksums.json` – SHA-256 per surah + whole file. `npm test` and server start-up both verify it.
- `data/source.json` – provenance/attribution shown in every API response.
- `src/pack.js` parse + verify · `src/router.js` routes · `src/app.js` app factory · `dev-server.js` local run (`node modules/quran/dev-server.js`).
- Importing a new Tanzil version: replace the txt, run `node modules/quran/scripts/pin-checksums.js`, review the diff of `checksums.json` (every changed line is a change to the Quran text), update `source.json`.

Attribution is required wherever text is shown: "Tanzil Project", linked to https://tanzil.net.

Known upstream quirk: in Tanzil's text, the basmala at the start of surahs 95 and 97 carries an extra shadda on the ba. It is served unchanged and pinned by a test; report it to a reviewer/Tanzil rather than fixing it here.

## Pilot (AI draft experiment, not part of the API)

`node modules/quran/pilot/run.js` is a dry run. `--run` needs `PILOT_API_KEY`, `PILOT_MODEL`, `PILOT_CAP_USD`, `PILOT_PRICE_IN_PER_M`, `PILOT_PRICE_OUT_PER_M` (see `.env.example`). It refuses to send a call whose worst case would pass the cap, uses one provider only, sends no third-party i'rab/tafsir text (ungrounded), rejects any draft that alters a word, and writes labelled `ai_draft` files to git-ignored `pilot-output/`. `--gold <file>` scores against a local gold file (keep it in git-ignored `gold/`; evaluation only). Results are a pilot, not a validated error rate.
