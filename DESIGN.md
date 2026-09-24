---
name: Calcio Chigi
description: PWA della squadra del Circolo Chigi — calendario, rosa, torneo, statistiche e sala operativa dei manager.
colors:
  background: "oklch(0.985 0 0)"
  foreground: "oklch(0.141 0.005 285.823)"
  card: "oklch(1 0 0)"
  muted: "oklch(0.96 0.005 285)"
  muted-foreground: "oklch(0.48 0.02 285)"
  border: "oklch(0.92 0.004 286.32)"
  primary: "oklch(0.52 0.22 260)"
  primary-foreground: "oklch(0.985 0 0)"
  operative: "oklch(0.541 0.281 293.009)"
  operative-foreground: "oklch(0.985 0 0)"
  secondary: "oklch(0.55 0.22 27)"
  secondary-foreground: "oklch(0.985 0 0)"
  destructive: "oklch(0.577 0.245 27.325)"
  dark-background: "oklch(0.15 0.05 260)"
  dark-card: "oklch(0.20 0.05 260)"
  dark-primary: "oklch(0.65 0.20 260)"
  dark-operative: "oklch(0.702 0.183 293.541)"
typography:
  display:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 900
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 900
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 700
    letterSpacing: "0.05em"
  caption:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.625rem"
    fontWeight: 700
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
  full: "9999px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    height: "36px"
  button-operative:
    backgroundColor: "{colors.operative}"
    textColor: "{colors.operative-foreground}"
    rounded: "{rounded.md}"
    height: "36px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.xl}"
  bottom-nav:
    backgroundColor: "{colors.background}"
    rounded: "{rounded.full}"
    height: "56px"
---

# Design System: Calcio Chigi

## Overview

**Creative North Star: "Lo spogliatoio ordinato"**

Un'app da usare in piedi, dal telefono, tra un allenamento e l'altro: sportiva, diretta, affidabile. Ogni schermata risponde a una domanda operativa (quando si gioca, chi c'è, chi ha pagato) con dati densi ma leggibili, senza decorazioni che competono con i numeri.

Mobile e desktop sono due composizioni della stessa gerarchia: su telefono una cosa per volta e un solo scroll di pagina; su desktop più pannelli affiancati. Chrome leggero (header fisso, barra di navigazione a pillola), contenuto al centro.

**Key Characteristics:**
- Titoli neri pesanti (Inter 900), corpo piccolo e fitto.
- Un accento interattivo blu, un viola riservato ai manager, colori di stato solo per il loro significato.
- Superfici piatte su card bianche/blu notte, ombre minime.
- Target touch di almeno 44px su dispositivi touch.

## Colors

Neutri freddi, un blu d'azione, un viola operativo e una piccola famiglia di colori semantici.

### Primary
- **Blu Chigi** (`--primary`): azioni generali, link, focus ring, selezioni, anello presenze. In dark diventa più luminoso con testo blu notte.

### Secondary
- **Viola operativo** (`--operative`): solo azioni e identità dei manager — "Gestione", "Aggiungi evento", "Modifica", "Pubblica formazione", badge Manager, anello avatar manager, tab della sala operativa.
- **Rosso Chigi** (`--secondary`): evidenza della prossima partita (bordo e badge "Prossima partita").

### Neutral
- **Sfondo** (`--background`) quasi bianco / blu notte profondo in dark.
- **Card** (`--card`) bianco / blu notte più chiaro.
- **Muted** (`--muted`, `--muted-foreground`) per etichette, metadati, contatori.
- **Bordo** (`--border`) sottile; in dark bianco al 15%.

### Semantic (classi Tailwind, sempre con variante `dark:`)
- **Partita**: blu (`blue-50/600/700`).
- **Allenamento**: arancione (`orange-50/600/700`). Mai ambra.
- **Vittoria / presente**: verde/emerald `-700` su `-50/100`.
- **Sconfitta / assente**: rosso `-700` su `-50/100`.
- **Pareggio / attesa / KO**: ambra `-700/-800` su `-50/100`.
- **U35**: sky (`bg-sky-100 text-sky-700`, dark `sky-950/sky-200`).

### Named Rules
**The One Blue Rule.** Il blu d'azione è `--primary`; il blu "Partita" vive solo dentro chip, filtri e icone di tipo evento. Nessun bottone generico usa classi `blue-*`.

**The Manager Violet Rule.** Il viola compare solo dove agisce un manager e solo tramite `operative` (`bg-operative`, `text-operative`, `border-operative/40`, `bg-operative/10`). Niente `violet-*` o `purple-*` raw.

**The Meaning-Only Rule.** Verde, rosso e ambra indicano uno stato. Non si usano per decorare (niente anelli verdi sugli avatar, niente rosso per "in evidenza": per quello c'è `--secondary`).

## Typography

**Font:** Inter (next/font), con fallback di sistema.

**Character:** una sola famiglia, contrasto affidato al peso: 900 per titoli e numeri, 500–700 per il resto.

### Hierarchy
- **Display** (900, 1.875rem, tracking stretto): `h1` di pagina nella `PageTitleBar`.
- **Title** (900, 1.125–1.25rem): titoli di sezione e card (`h2`/`h3`).
- **Body** (500, 0.875rem): testo corrente, righe di lista.
- **Label** (700, 0.6875rem, maiuscolo, tracking largo): etichette di campo e contatori.
- **Caption** (700, 0.625rem): il minimo assoluto — badge, sigle, orari nei chip compatti.

### Named Rules
**The 10px Floor Rule.** Nessun testo sotto i 10px. Se non entra, si abbrevia (sigle ruolo POR/DIF/CEN/ATT con nome intero per screen reader) o si sposta nell'`aria-label`.

**The No-Kicker Rule.** Niente occhielli maiuscoli sopra i titoli ("Vista mensile", "Agenda"): il titolo parla da solo.

## Layout

`PageContainer` centra il contenuto a `max-w-7xl` con gutter 8/16/24px. Header fisso alto 64px (`top-16` per ogni elemento sticky sotto di esso), bottom nav fissa a pillola con padding di sicurezza (`pb-bottom-nav`). Su mobile una colonna e un solo scroll: niente liste con scroll interno, si mostra un'anteprima (top 5) con "Mostra tutti". Le scelte tra viste parallele su telefono passano da un selettore segmentato; su desktop le viste stanno affiancate in griglia.

## Elevation & Depth

Piatto per default: card con bordo e `shadow-xs`/`shadow-sm`. Le ombre più forti restano a overlay e dialog (`shadow-lg`) e alla prossima partita (`shadow-lg` tinta `secondary`). Niente glow colorati.

## Shapes

Raggio base 10px (`--radius`), card `rounded-xl`, chip e bottoni `rounded-md`, pillole (`rounded-full`) per nav, filtri e badge contatore. Niente bordi laterali colorati spessi su card o righe: lo stato si indica con un pallino, un'icona o una tinta di sfondo.

## Components

- **Button**: varianti `default` (primary), `outline`, `ghost`, `destructive`, `link`; le azioni manager aggiungono `bg-operative text-operative-foreground hover:bg-operative/90`. Su pointer coarse `min-h-11` (e `min-w-11` per le icone) automatici.
- **Switch**: area di tocco estesa a 44px con pseudo-elemento; stato, mai azione (per le azioni di gruppo si usano bottoni espliciti).
- **Checkbox nativa**: `accent-color` dal tema, avvolta in una label da 44px nelle liste touch.
- **Dialog**: X da 44px in alto a destra, il titolo si tiene lontano; footer sticky quando il contenuto scorre.
- **Card evento**: header tinto per tipo (blu partita / arancione allenamento), icona di tipo, niente animazioni infinite.
- **Stato vuoto vs errore**: un errore di rete mostra "non disponibile" + "Riprova", mai una lista vuota.

## Do's and Don'ts

- **Do** usare i token (`primary`, `operative`, `secondary`, `muted`, `destructive`) per tutto ciò che non è un colore semantico di tipo/stato.
- **Do** dare a ogni colore semantico la sua variante `dark:`.
- **Do** tradurre gli enum (`TODO`, `DUE`, `YES`) con le funzioni di `profile-operations.ts`.
- **Don't** usare `violet-*`, `purple-*` o `emerald` come identità: esistono i token.
- **Don't** mettere testo bianco su arancione-500 o giallo-500 (contrasto sotto 3:1): usa `-700` con bianco o `-400` con testo `-950`.
- **Don't** usare `animate-ping`/`animate-pulse` per decorare: il movimento è riservato a caricamenti e feedback.
- **Don't** usare `unoptimized` sui loghi: le query `?v=` sono ammesse da `images.localPatterns`.
