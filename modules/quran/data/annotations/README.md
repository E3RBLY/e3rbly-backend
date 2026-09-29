# Ayah annotation packs (tafsir, i'rab, simple explanations)

**This folder is empty on purpose.** Nothing may be added until the source's license or written permission is saved in `docs/licenses/` (see `docs/CONTENT_SOURCES.md`). The app shows "not available yet" for ayat with no content and never invents text.

## Add a pack

```
data/annotations/<source-id>/source.json
data/annotations/<source-id>/surah-<n>.json
```

`source.json`

```json
{
  "id": "example-source",
  "kind": "tafsir",
  "name_ar": "اسم الكتاب",
  "author_ar": "المؤلف",
  "edition": "الطبعة / المحقق",
  "attribution_text": "المصدر: ... (الصيغة التي حددها صاحب الحقوق)",
  "license": "what the permission/terms say",
  "license_file": "example-permission.md",
  "provenance": "imported"
}
```

- `kind`: `tafsir` | `i3rab` | `simple`
- `provenance`: `imported` (needs `edition`) | `curated` | `ai_draft`
- `license_file`: a file that exists in `docs/licenses/` (saved terms or the reply granting permission)

`surah-<n>.json` maps `"surah:ayah"` to items. Only `i3rab` may have several items per ayah (one per wajh, each with a `label`):

```json
{ "2:255": [ { "body_ar": "…", "review_status": "reviewed" } ] }
```

`review_status`: `unreviewed` | `reviewed` | `disputed`. **Only `reviewed` items are served.** Set `QURAN_INCLUDE_UNREVIEWED=true` on a staging deploy to see the rest.

## Check before committing

```
npm run validate:annotations
```

It fails (exit 1) on a missing license file, unknown enum value, ayah outside its surah, empty text, or wujuh without labels. The server refuses to start with an invalid pack.

## "Simple explanation" (`kind: simple`)

Written for anyone to understand. It is produced from licensed tafsir text, drafted by AI (`provenance: ai_draft`), and shown to users **only after a reviewer marks each item `reviewed`**. Running the drafting costs money (Tier C): it needs the owner's approved budget cap first (see the pilot in `modules/quran/pilot`).
