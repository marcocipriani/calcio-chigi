#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

process.env.TZ = 'Europe/Rome';

const DEFAULT_URL = 'https://asicalciolazio.enjore.com/t-printable.php?t=113994&sk=calendar';
const MY_TEAM = 'CIRC. CHIGI';
const SEASON_START_YEAR = 2025;
const SEASON_END_YEAR = 2026;

const args = new Set(process.argv.slice(2));
const shouldApply = args.has('--apply');
const shouldPrintSql = args.has('--sql');
const shouldIncludeOnlyChigi = args.has('--only-chigi');
const url = process.argv.find((arg) => arg.startsWith('--url='))?.slice('--url='.length) || DEFAULT_URL;

loadDotEnv('.env.local');

const TEAM_ALIASES = new Map([
  ['veterinari', 'VETERINARI'],
  ['jazzisti', 'JAZZISTI'],
  ['iannaccone & ass', 'IANNACCONE & ASS'],
  ['circ. pal. madama', 'CIRC. PAL. MADAMA'],
  ['psicologol', 'PSICOLOGOL'],
  ['giornalisti rai', 'GIORNALISTI RAI'],
  ["casc. banca d'italia", "CASC. BANCA D'ITALIA"],
  ['dopolavoro atac cotral', 'DOPOLAVORO ATAC COTRAL'],
  ['circ. chigi', MY_TEAM],
  ['vvf', 'VVF'],
]);

const PHASE_ALIASES = [
  { includes: 'coppa lazio', value: 'COPPA_LAZIO_PROFESSIONISTI' },
  { includes: 'professionisti nel pallone', value: 'FASE_2_PROFESSIONISTI' },
  { includes: 'calciatori', value: 'FASE_2_CALCIATORI' },
  { includes: 'girone arti&mestieri', value: 'FASE_1' },
];

const html = await fetchHtml(url);
let matches = parseMatches(html);

if (shouldIncludeOnlyChigi) {
  matches = matches.filter((match) => match.squadra_casa === MY_TEAM || match.squadra_ospite === MY_TEAM);
}

if (shouldPrintSql) {
  process.stdout.write(generateSql(matches));
  process.exit(0);
}

if (shouldApply) {
  await applyToSupabase(matches);
  process.exit(0);
}

printSummary(matches);

function loadDotEnv(path) {
  if (!existsSync(path)) return;

  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;

    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

async function fetchHtml(targetUrl) {
  const response = await fetch(targetUrl, {
    headers: {
      'accept-language': 'it-IT,it;q=0.9,en;q=0.8',
      'user-agent': 'calcio-chigi-sync/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`Impossibile scaricare calendario Enjore: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

function parseMatches(sourceHtml) {
  const pieces = sourceHtml.split(/<div id="match-/).slice(1);
  const parsed = [];

  for (const piece of pieces) {
    const id = piece.match(/^(\d+)"/)?.[1];
    if (!id) continue;

    const block = piece.split(/<\/div><\/div><div class="col-xs-12"/)[0];
    const header = block.slice(0, block.indexOf('">') + 2);
    const playedByClass = /\bplayed\b/.test(header);
    const roundId = header.match(/round-(\d+)/)?.[1] || null;
    const giornata = Number(stripTags(block.match(/tmatch-top[^>]*>([\s\S]*?)<\/div>/)?.[1] || '').match(/\d+/)?.[0]);
    const teamNames = [...block.matchAll(/<div class="team-name[^"]*">([\s\S]*?)<\/div>/g)].map((match) => normalizeTeam(match[1]));
    const [homeTeam, awayTeam] = teamNames;

    if (!homeTeam || !awayTeam || !giornata) continue;

    const scoreMatch = block.match(/tmatch-right[\s\S]*?<div class='top[^']*'>([\s\S]*?)<\/div>[\s\S]*?<div class='bottom[^']*'>([\s\S]*?)<\/div>/);
    let golCasa = parseOptionalInt(scoreMatch?.[1]);
    let golOspite = parseOptionalInt(scoreMatch?.[2]);

    const note = normalizeSpaces(decodeHtml(stripTags(block.match(/<div class='note'>([\s\S]*?)<\/div>/)?.[1] || ''))) || null;
    const forfeitLoser = note?.match(/persa a tavolino per\s+(.+)$/i)?.[1];
    if ((golCasa === null || golOspite === null) && forfeitLoser) {
      const loser = canonicalTeam(forfeitLoser);
      if (loser === homeTeam) {
        golCasa = 0;
        golOspite = 3;
      } else if (loser === awayTeam) {
        golCasa = 3;
        golOspite = 0;
      }
    }

    const groupName = normalizeSpaces(decodeHtml(stripTags(block.match(/<div class='left'>[\s\S]*?<b>([\s\S]*?)<\/b>/)?.[1] || ''))) || null;
    const dateText = normalizeSpaces(decodeHtml(stripTags(block.match(/<div class='center'>([\s\S]*?)<\/div>/)?.[1] || ''))) || null;
    const place = normalizeSpaces(decodeHtml(stripTags(block.match(/<div class='right'>([\s\S]*?)<\/div>/)?.[1] || ''))) || null;
    const dataOra = dateText ? parseItalianDate(dateText) : null;
    const phase = phaseFromGroup(groupName);
    const isChigi = homeTeam === MY_TEAM || awayTeam === MY_TEAM;
    const played = playedByClass || (golCasa !== null && golOspite !== null);

    parsed.push({
      enjore_id: id,
      round_id: roundId,
      tipo: 'PARTITA',
      data_ora: dataOra,
      luogo: place,
      avversario: isChigi ? (homeTeam === MY_TEAM ? awayTeam : homeTeam) : `${homeTeam} vs ${awayTeam}`,
      note,
      gol_nostri: isChigi && played ? (homeTeam === MY_TEAM ? golCasa : golOspite) : null,
      gol_avversario: isChigi && played ? (homeTeam === MY_TEAM ? golOspite : golCasa) : null,
      giocata: played,
      giornata,
      squadra_casa: homeTeam,
      squadra_ospite: awayTeam,
      gol_casa: played ? golCasa : null,
      gol_ospite: played ? golOspite : null,
      cancellato: false,
      data_fine_ora: null,
      tipo_campo: null,
      fase: phase,
    });
  }

  return parsed.sort((a, b) => {
    const dateA = a.data_ora || '9999-12-31';
    const dateB = b.data_ora || '9999-12-31';
    return dateA.localeCompare(dateB) || a.fase.localeCompare(b.fase) || a.giornata - b.giornata;
  });
}

function normalizeTeam(value) {
  return canonicalTeam(normalizeSpaces(decodeHtml(stripTags(value))));
}

function canonicalTeam(value) {
  const key = normalizeSpaces(decodeHtml(String(value).replace(/\u00a0/g, ' '))).toLowerCase();
  return TEAM_ALIASES.get(key) || key.toUpperCase();
}

function phaseFromGroup(groupName) {
  const key = (groupName || '').toLowerCase();
  return PHASE_ALIASES.find((phase) => key.includes(phase.includes))?.value || 'FASE_1';
}

function parseOptionalInt(value) {
  const text = normalizeSpaces(stripTags(value || ''));
  return /^\d+$/.test(text) ? Number(text) : null;
}

function parseItalianDate(value) {
  const match = value.match(/(?:lun|mar|mer|gio|ven|sab|dom)\s+(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})/i);
  if (!match) {
    throw new Error(`Formato data non riconosciuto: ${value}`);
  }

  const [, day, month, hour, minute] = match.map(Number);
  const year = month >= 9 ? SEASON_START_YEAR : SEASON_END_YEAR;
  return new Date(year, month - 1, day, hour, minute, 0, 0).toISOString();
}

function stripTags(value) {
  return String(value).replace(/<[^>]*>/g, ' ');
}

function normalizeSpaces(value) {
  return String(value).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function decodeHtml(value) {
  return String(value)
    .replace(/&nbsp;/g, ' ')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&bull;/g, '•')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function sql(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function generateSql(rows) {
  const tuples = rows.map((row) => `    (${[
    sql(uuidFromString(`enjore:${row.enjore_id}`)),
    sql(row.enjore_id),
    sql(row.data_ora),
    sql(row.luogo),
    sql(row.avversario),
    sql(row.note),
    sql(row.gol_nostri),
    sql(row.gol_avversario),
    sql(row.giocata),
    sql(row.giornata),
    sql(row.squadra_casa),
    sql(row.squadra_ospite),
    sql(row.gol_casa),
    sql(row.gol_ospite),
    sql(row.cancellato),
    sql(row.data_fine_ora),
    sql(row.tipo_campo),
    sql(row.fase),
  ].join(', ')})`);

  return `-- Generated by scripts/sync-enjore-calendar.mjs on ${new Date().toISOString()}
-- Source: ${url}
-- Run in Supabase SQL editor. Existing rows are matched by fase + giornata + squadra_casa + squadra_ospite.

begin;

with source_events (
  id,
  enjore_id,
  data_ora,
  luogo,
  avversario,
  note,
  gol_nostri,
  gol_avversario,
  giocata,
  giornata,
  squadra_casa,
  squadra_ospite,
  gol_casa,
  gol_ospite,
  cancellato,
  data_fine_ora,
  tipo_campo,
  fase
) as (
  values
${tuples.join(',\n')}
),
updated as (
  update public.events e
  set
    data_ora = coalesce(source_events.data_ora::timestamptz, e.data_ora),
    luogo = coalesce(source_events.luogo, e.luogo),
    avversario = source_events.avversario,
    note = source_events.note,
    gol_nostri = source_events.gol_nostri,
    gol_avversario = source_events.gol_avversario,
    giocata = source_events.giocata,
    giornata = source_events.giornata,
    squadra_casa = source_events.squadra_casa,
    squadra_ospite = source_events.squadra_ospite,
    gol_casa = source_events.gol_casa,
    gol_ospite = source_events.gol_ospite,
    cancellato = source_events.cancellato,
    data_fine_ora = coalesce(source_events.data_fine_ora::timestamptz, e.data_fine_ora),
    tipo_campo = coalesce(source_events.tipo_campo, e.tipo_campo),
    fase = source_events.fase
  from source_events
  where e.tipo = 'PARTITA'
    and coalesce(e.fase, 'FASE_1') = source_events.fase
    and e.giornata = source_events.giornata
    and upper(trim(e.squadra_casa)) = source_events.squadra_casa
    and upper(trim(e.squadra_ospite)) = source_events.squadra_ospite
  returning e.id
)
insert into public.events (
  id,
  tipo,
  data_ora,
  luogo,
  avversario,
  note,
  gol_nostri,
  gol_avversario,
  giocata,
  giornata,
  squadra_casa,
  squadra_ospite,
  gol_casa,
  gol_ospite,
  cancellato,
  data_fine_ora,
  tipo_campo,
  fase
)
select
  source_events.id::uuid,
  'PARTITA',
  source_events.data_ora::timestamptz,
  source_events.luogo,
  source_events.avversario,
  source_events.note,
  source_events.gol_nostri,
  source_events.gol_avversario,
  source_events.giocata,
  source_events.giornata,
  source_events.squadra_casa,
  source_events.squadra_ospite,
  source_events.gol_casa,
  source_events.gol_ospite,
  source_events.cancellato,
  source_events.data_fine_ora::timestamptz,
  source_events.tipo_campo,
  source_events.fase
from source_events
where source_events.data_ora is not null
  and not exists (
    select 1
    from public.events e
    where e.tipo = 'PARTITA'
      and coalesce(e.fase, 'FASE_1') = source_events.fase
      and e.giornata = source_events.giornata
      and upper(trim(e.squadra_casa)) = source_events.squadra_casa
      and upper(trim(e.squadra_ospite)) = source_events.squadra_ospite
  );

commit;
`;
}

async function applyToSupabase(rows) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Per --apply servono SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: existingRows, error } = await supabase
    .from('events')
    .select('id,tipo,fase,giornata,squadra_casa,squadra_ospite')
    .eq('tipo', 'PARTITA');

  if (error) throw error;

  const existingByKey = new Map(
    (existingRows || [])
      .filter((row) => row.squadra_casa && row.squadra_ospite && row.giornata)
      .map((row) => [eventKey(row), row]),
  );

  let updated = 0;
  let inserted = 0;
  let skipped = 0;

  for (const row of rows) {
    const existing = existingByKey.get(eventKey(row));
    const payload = {
      tipo: row.tipo,
      ...(row.data_ora ? { data_ora: row.data_ora } : {}),
      ...(row.luogo ? { luogo: row.luogo } : {}),
      avversario: row.avversario,
      note: row.note,
      gol_nostri: row.gol_nostri,
      gol_avversario: row.gol_avversario,
      giocata: row.giocata,
      giornata: row.giornata,
      squadra_casa: row.squadra_casa,
      squadra_ospite: row.squadra_ospite,
      gol_casa: row.gol_casa,
      gol_ospite: row.gol_ospite,
      cancellato: row.cancellato,
      data_fine_ora: row.data_fine_ora,
      tipo_campo: row.tipo_campo,
      fase: row.fase,
    };

    if (existing) {
      const { error: updateError } = await supabase.from('events').update(payload).eq('id', existing.id);
      if (updateError) throw updateError;
      updated += 1;
      continue;
    }

    if (!row.data_ora) {
      skipped += 1;
      continue;
    }

    const { error: insertError } = await supabase.from('events').insert({
      id: uuidFromString(`enjore:${row.enjore_id}`),
      ...payload,
    });
    if (insertError) throw insertError;
    inserted += 1;
  }

  console.log(`Sync completata: ${updated} aggiornate, ${inserted} inserite, ${skipped} saltate senza data.`);
}

function eventKey(row) {
  return [
    row.fase || 'FASE_1',
    row.giornata,
    normalizeKey(row.squadra_casa),
    normalizeKey(row.squadra_ospite),
  ].join('|');
}

function normalizeKey(value) {
  return normalizeSpaces(String(value || '').toUpperCase());
}

function uuidFromString(value) {
  const hex = createHash('sha1').update(value).digest('hex').slice(0, 32).split('');
  hex[12] = '5';
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20, 32).join('')}`;
}

function printSummary(rows) {
  const phaseCounts = rows.reduce((acc, row) => {
    acc[row.fase] = (acc[row.fase] || 0) + 1;
    return acc;
  }, {});
  const chigiMatches = rows.filter((row) => row.squadra_casa === MY_TEAM || row.squadra_ospite === MY_TEAM);

  console.log(`Calendario letto da Enjore: ${rows.length} partite.`);
  console.log(`Fasi: ${Object.entries(phaseCounts).map(([phase, count]) => `${phase}=${count}`).join(', ')}`);
  console.log(`Partite ${MY_TEAM}: ${chigiMatches.length}`);
  console.log('');
  console.log('Comandi utili:');
  console.log('  node scripts/sync-enjore-calendar.mjs --sql > scripts/update-tournament-events.sql');
  console.log('  SUPABASE_SERVICE_ROLE_KEY=... node scripts/sync-enjore-calendar.mjs --apply');
}
