# Tanzil Quran text: terms of use (verbatim)

Two verbatim copies, both retrieved 2026-09-29 by direct download:
1. Notice embedded in the downloaded file `modules/quran/data/quran-uthmani.txt` (this is the binding notice for the text we ship).
2. Page https://tanzil.net/docs/text_license (older year range, same terms).

## 1. Notice inside the downloaded file (comment header/footer, unchanged)

```
PLEASE DO NOT REMOVE OR CHANGE THIS COPYRIGHT BLOCK
====================================================================

 Tanzil Quran Text (Uthmani, Version 1.1)
 Copyright (C) 2007-2026 Tanzil Project
 License: Creative Commons Attribution 3.0

 This copy of the Quran text is carefully produced, highly 
 verified and continuously monitored by a group of specialists 
 at Tanzil Project.

 TERMS OF USE:

 - Permission is granted to copy and distribute verbatim copies 
   of this text, but CHANGING IT IS NOT ALLOWED.

 - This Quran text can be used in any website or application, 
   provided that its source (Tanzil Project) is clearly indicated, 
   and a link is made to tanzil.net to enable users to keep
   track of changes.

 - This copyright notice shall be included in all verbatim copies 
   of the text, and shall be reproduced appropriately in all files 
   derived from or containing substantial portion of this text.

 Please check updates at: http://tanzil.net/updates/

====================================================================
```

## 2. Page https://tanzil.net/docs/text_license

```
Tanzil Quran Text
Copyright (C) 2007-2021 Tanzil Project
License: Creative Commons Attribution 3.0

This copy of the Quran text is carefully produced, highly
verified and continuously monitored by a group of specialists
in Tanzil Project.

TERMS OF USE:

- Permission is granted to copy and distribute verbatim copies
  of this text, but CHANGING IT IS NOT ALLOWED.

- This Quran text can be used in any website or application,
  provided that its source (Tanzil Project) is clearly indicated,
  and a link is made to tanzil.net to enable users to keep
  track of changes.

- This copyright notice shall be included in all verbatim copies
  of the text, and shall be reproduced appropriately in all files
  derived from or containing substantial portion of this text.

Please check updates at: http://tanzil.net/updates/
```

## How we comply

| Condition | How |
|---|---|
| Verbatim, no changes | `quran-uthmani.txt` is stored byte-for-byte as downloaded (marked `-text` in `.gitattributes`, so git never rewrites line endings). API returns the ayah string untouched. Per-surah SHA-256 in `checksums.json`, enforced by tests and at startup. |
| Source clearly indicated + link | Every `/v1/quran/*` response carries a `source` object (name, url, license). The Flutter UI must show "Tanzil Project (tanzil.net)" with a link wherever Quran text is shown. |
| Notice reproduced in files containing a substantial portion | The raw file keeps its header/footer. `GET /v1/quran/source` returns the notice text. Any future SQLite/JSON content pack must embed it. |
