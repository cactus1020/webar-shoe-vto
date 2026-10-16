# Live deployment

Application project: `shoe-vto`, production alias <https://shoe-vto.vercel.app>.
Current deployment: `dpl_4vkwY1b9VMbmH3REc3SSqF8kzSPz`.

User-facing URL: <https://pokemons.covers.bd/shoe_vto>.
That domain belongs to the separate `ar-shop` project
(`prj_PDtHTpLPn3ZdpBucdGmFL51mMB2t`), which previously served a copied older build.

Two project-level rewrite rules now proxy only this host's `/shoe_vto` page and
`/shoe_vto/*` assets to the stable `shoe-vto.vercel.app` production alias.
Other paths and domains are not matched. Original ar-shop source, shop, tutor and
API routing were not redeployed or edited. Future shoe-vto production deployments
automatically reach the user-facing URL through the stable alias.

Rules are saved in the two adjacent JSON files. Published routing version:
`0d6c7da9-cfd3-4aa0-82e1-27cf713914ed`.

Verified on 2026-10-05: new measurement/upload/chart UI present at the exact URL;
JS bundle, printable SVG, chart JSON and WASM module all returned HTTP 200.
The shop root and `/tutor22` also returned HTTP 200.

The following tracking update activates the versioned public-data candidate,
shows training/build time in the UI, corrects crop/confidence/duplicate handling,
and adds guided heel/toe manual alignment. Regression tests and a controlled
mobile-sized browser camera fixture pass; real-phone automatic bare-foot tracking
still needs validation and further training.

Live verification for this update: the browser loaded
`cmu-pilot-20261005-1601`, displayed training time `05 Oct 2026, 16:01 BDT`
and app build time `16:51 BDT`, with no console errors/warnings. Downloading
the ONNX through the exact covers.bd URL produced the expected SHA-256
`30a2680c28d6231c0f1f218158b9763e185ba882ac72bfc67b207fce8dfc50de`.
`n2026-10-15: Reference studio upgrade published as dpl_C25nPVp94b4Z1XU7G1SMeobc7LTm, alias shoe-vto.vercel.app. Vercel reports READY. Local desktop/mobile studio rendering and model startup passed; production URL browser/HTTP checks were blocked by local DNS resolution failures. Real-phone motion tracking remains unverified.
