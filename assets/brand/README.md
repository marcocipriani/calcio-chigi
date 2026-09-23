# Asset del Circolo Chigi

## Sorgente e anteprime

- [`source/circolo-chigi-white.png`](source/circolo-chigi-white.png): originale
  approvato, PNG trasparente da 780 × 922 px. Non modificarlo per creare varianti.
- [`previews/logo-icone.png`](previews/logo-icone.png): logo chiaro/scuro e
  simulazioni delle icone iOS e Android.
- [`previews/login.png`](previews/login.png): login verificato nei due temi,
  senza ripetere il nome sotto il logo.
- [`previews/splash.png`](previews/splash.png): splash Apple chiaro/scuro.

SHA-256 del sorgente:
`b7966cdbd3394c3563d417467794800ab755444b9f6bf967c0e9701744417805`.

Le anteprime rappresentano la versione consolidata. I confronti sperimentali
restano in `test-results/brand/`, escluso da Git; la proposta Android più grande
che supera l'area sicura non è utilizzata dall'app.

## Asset pubblici

| Percorso | Uso |
| --- | --- |
| `public/brand/logos/logo-circolo-chigi.webp` | Logo completo con scritta bianca, tema scuro |
| `public/brand/logos/logo-circolo-chigi-light.webp` | Logo completo con scritta blu scuro, tema chiaro |
| `public/brand/logos/logo-circolo-chigi-mark.webp` | Scudo e nastro, header e campo formazione |
| `public/brand/icons/icon-192x192.png`, `icon-512x512.png` | Icone PWA trasparenti con margini ridotti |
| `public/brand/icons/icon-maskable-512x512.png` | Icona Android opaca con nastro nell'area sicura |
| `public/brand/splash/` | 88 splash Apple: 22 formati, due orientazioni, due temi |
| `public/apple-touch-icon.png` | Icona iOS opaca da 180 × 180 px |
| `public/favicon.ico` | Favicon con immagini da 16, 32 e 48 px |
| `public/teams/chigi.png` | Logo della squadra; percorso conservato per i riferimenti nei dati |
| `src/lib/apple-startup-images.json` | Indice generato dei media query e URL degli splash |

`public/manifest.json` è il manifest canonico. Lo script lo copia anche in
`public/site.webmanifest` per mantenere compatibilità senza divergenze.
`next.config.ts` conserva i vecchi URL con redirect permanenti. L'ex `icon.png`
rimanda all'icona da 512 px, evitando una copia identica.

## Rigenerazione

Dalla root del progetto, con le dipendenze installate:

```bash
npm run assets:brand
npm run test:brand
```

Lo script [`generate-brand-assets.mjs`](../../scripts/generate-brand-assets.mjs)
usa `sharp`, già installato con Next.js. Mantiene colori e pixel visibili
del sorgente nei ritagli a dimensione nativa. Solo la scritta superiore cambia
colore nella variante chiara. PNG e WebP sono lossless: niente ridisegno,
sharpening o ingrandimento del bitmap. Le immagini del logo saltano la
ricompressione di `next/image`.

L'icona Android contiene uno stemma largo 337 px su una tela da 512 px: tutti i
pixel visibili rientrano nel cerchio sicuro di raggio 204,8 px. Un ingrandimento
sostanziale può tagliare parti del logo su alcuni launcher. Il test controlla
questa condizione sui file effettivamente generati.

Dopo una modifica visiva, rigenerare gli asset, eseguire i test e aggiornare le
anteprime. Se cambiano file pubblici già distribuiti, aggiornare gli URL
versionati e il nome della cache in `public/sw.js`.

## Splash e verifica

Il tema dello splash Apple segue il sistema; il logo dentro l'app segue anche
la preferenza manuale. Per nuovi formati Apple o finestre multitasking, aggiungere
le dimensioni nello script e rigenerare l'indice. I formati non elencati non
hanno uno splash personalizzato.

Android genera lo splash nativo da icona e manifest, con sfondo bianco.
Non viene aggiunta una schermata di caricamento artificiale.

Le verifiche browser controllano layout, temi, media query e cache. Non
equivalgono alla verifica dell'avvio nativo, da eseguire su dispositivi fisici
dopo la pubblicazione. Un'installazione esistente può richiedere una nuova
aggiunta alla schermata Home per aggiornare icona e splash.
