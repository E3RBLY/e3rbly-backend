# AlQuran Cloud API: terms and how we use it

Retrieved 2026-09-30 from https://alquran.cloud/terms-and-conditions (page text copied below, navigation removed).
Related: https://tanzil.net/trans/ (Tanzil's own note on its Arabic tafsir/translation editions, quoted in the risks section).

## Verbatim terms page

```
Terms and Conditions
Original terms
AlQuran.cloud is part of the
Islamic Network
.
This website, API and all the services herein are made available in the hope that they will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. The Quran text and audio provided has been originally retrieved from GlobalQuran.com.
All audio files used on this website and third party libraries own and retain their respective copyrights.
Extended terms — additional guidance on fair use, rate limits and translation licensing.
Section 
I
Acceptance of these terms
By accessing the Al Quran Cloud website, the alquran.cloud REST API, or the islamic.network media CDN — collectively, “the Service” — you agree to be bound by the terms set out below. If you do not agree, please do not use the Service.
These terms may be amended from time to time; the current version is always the one published at this URL. Material changes will be summarised in a notice at the head of this page for a reasonable period after they take effect.
Last updated: 14 June 2026.
Section 
II
Fair use of the Quranic text
The Arabic text of the Quran served through this Service is sourced from various sources, including Tanzil.net and Quran Academy, whose curation we gratefully attribute. The text is the Word of God and belongs to no one; the curation effort, however, belongs to these organisations and the people behind them.
You may reproduce, embed, store and display the text freely, for any non-commercial purpose. Commercial reproduction — printed copies for sale, paid-for apps that bundle the corpus offline — requires no permission from us but a respectful acknowledgement of the source in the colophon is the minimum courtesy.
We ask that any reproduction faithfully preserves the diacritics and orthography of the Uthmani recension. The text must not be altered or commingled with non-Quranic material in a way that could be mistaken for the Quran itself.
Section 
III
API and CDN — rate limits and fair use
The API is free and key-less. To keep it that way for everyone, there is a soft rate limit applied on a per second bases per IP address. Rate limiting details can be found at https://community.islamic.network/knowledgebase/2-is-there-a-rate-limit-on-the-apis-cdn.
If you have a use case that legitimately needs higher throughput — research projects, full-corpus mirrors, large enterprise apps — please get in touch through the contact page.
The audio CDN has no per-client throttle, but please cache aggressively at your own edge. The same 6,236 ayah files are requested millions of times a day; downstream caching benefits everyone.
Section 
IV
Translations and recitations
Translations are contributed by their rights-holders or sourced from public-domain editions. Each is delivered with its edition identifier intact. If you republish a translation, please attribute the translator by name.
Recitations are licensed to us by the reciters or their estates for free, non-commercial redistribution at the bitrates we publish. You may stream, embed and download them for personal and educational use. You may bundle them into a commercial product, but please note that copyrights lie with the reciters and they may ask you to remove the conent.
Section 
V
No warranties — the Service is provided as-is
The Service is offered in good faith and for the benefit of the Ummah, without any express or implied warranty of fitness, accuracy, availability or merchantability. We take great care with the corpus and the infrastructure — but a free volunteer-run service cannot make legal promises.
وَمَا تَوْفِيقِى إِلَّا بِٱللَّهِ.
```

## What we use

Six Arabic tafsir editions served by the API: `ar.muyassar`, `ar.jalalayn`, `ar.qurtubi`, `ar.baghawi`, `ar.waseet`, `ar.miqbas` (the API's own edition list, type `tafsir`).

## How we comply

| Requirement / request | What we do |
|---|---|
| Free, key-less API; soft per-second per-IP rate limit | One request per ayah tap (all needed editions in a single call), never a bulk crawl. No scripted mirroring. |
| "Cache aggressively at your own edge" | Per-instance LRU cache plus long CDN cache headers on our responses. |
| "Full-corpus mirrors: get in touch" | We deliberately do NOT mirror the corpus into our repo. |
| Attribute translators/authors by name | Every tafsir card shows the book, the author (where the source states one) and "via AlQuran Cloud (alquran.cloud)". |
| Text must not be altered | We serve each tafsir string exactly as received (no rewriting, no harakat changes). |
| Editions keep their identifier | The edition id is part of each item's id (`aqc-...`) and shown in the attribution line. |
| Service may change | Failures degrade gracefully: the other tabs and the AI-draft tabs still work. |

## Owner decision

On 2026-09-30 the owner asked to integrate all available free sources. This file records that decision and the risks below.

## Risks the owner accepted (read these)

1. **Rights remain with the original contributors.** The terms say translations are "contributed by their rights-holders or sourced from public-domain editions", and the service only redistributes. For the tafsir editions no per-edition license is stated.
2. **Tanzil says its Arabic tafsir/translation editions are non-commercial.** Its translations page states: "The translations provided at this page are for non-commercial purposes only. If used otherwise, you need to obtain necessary permission from the translator or the publisher." If AlQuran Cloud's tafsir editions come from that catalogue, this applies. The app shows ads (AdMob), which may count as commercial use.
3. **Al-Muyassar belongs to the King Fahd Complex** (credited by both sites). A written permission request is drafted in `permission-requests.md` and should still be sent.
4. **The attribution of "Tanwir al-Miqbas" to Ibn Abbas is disputed among scholars.** The app says so on the card.
5. **Kill switches (no code change):** set `QURAN_REMOTE_TAFSIR=false` to turn all six off, or `QURAN_DISABLED_SOURCES=aqc-qurtubi,aqc-miqbas` to turn off individual ones.
