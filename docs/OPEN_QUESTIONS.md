# Open questions for the owner

Each has my recommended default. If you don't answer, I proceed with the default.

| # | Question | Why it matters | My default |
|---|---|---|---|
| Q1 | Open the installed app and run one i'rab. Does it work or error? | Confirms whether production is down (model shut down 2026-06-01). | Assume it's broken; the Gemini migration is the first fix. |
| Q2 | Is the app live on Google Play? Roughly how many active installs? | Decides how carefully we protect the old URL and old API shape. | Assume yes, so the `/api/*` shape stays backward-compatible. |
| Q3 | Can you find the **old Vercel account** (try GitHub `E3RBLY` login and `mahmoudkarsli1998@outlook.com`; project `e3rbly-backend-main`)? | It's the only way to keep old installs working without an app update, and to recover the undeployed source. | Assume lost: new Vercel account plus an app update. |
| Q4 | Gemini: will the new key be on a project **with billing**? Any monthly budget cap? | Free-tier limits vs. public traffic; C3. | Free tier for dev, a hard IP rate limit in prod, and a budget alert once billing is on. |
| Q5 | OK to **remove** the backend `/auth/*` routes and the JWT system? The app uses Firebase Auth directly and never calls them. | Removes H5 and C4 attack surface. Deleting endpoints needs your approval. | Yes, remove them in Phase 2. |
| Q6 | OK to **delete stale branches** `clean-code`, `fix-issues`, `grammar-concepts` (backend) and `Dev`, `enhancements`, `publish`, `restore-16kb-version` (mobile)? They're preserved in the backup bundle. | Clean GitHub, as you asked. | Yes, after the backup. |
| Q7 | Backend repo after the history rewrite: keep **public** or make **private**? | Public is fine once clean, but private is the safer default for a product with ads. | Private. |
| Q8 | Network: can you allow `registry.npmjs.org` for Claude (Team/Enterprise: Admin settings → Capabilities)? Otherwise, are you OK running `npm install` on your machine when I ask? | I can't install packages from my workspace today. | You run installs when needed; CI verifies. |
| Q9 | Share the **Firestore security rules** (Firebase console → Firestore → Rules → copy). | The only protection on user data (M11). | I'll add them to the repo and review. |
| Q10 | Backend in **TypeScript** (incremental) or stay JS with JSDoc types? | Phase 3 effort. | TypeScript, incremental. |
| Q11 | Keep ads and the "3 free analyses" model? | Moving the quota server-side changes the product. | Keep; enforce limits server-side (per IP/user). |
| Q12 | Crash reporting: OK to add **Firebase Crashlytics**? You already use Firebase, so no new vendor. | Phase 1 hook. | Yes, Crashlytics. |
