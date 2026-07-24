#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';

process.env.TZ = 'Europe/Rome';

const ANNOUNCEMENTS_URL =
  'https://asicalciolazio.enjore.com/it/announcement/113994/campionato-asi-over35_artimestieri_20252026/';

const HTML_ENTITIES = {
  nbsp: ' ', quot: '"', amp: '&', lt: '<', gt: '>',
  apos: "'", '#039': "'",
  agrave: 'à', aacute: 'á', acirc: 'â', atilde: 'ã', auml: 'ä', aring: 'å',
  egrave: 'è', eacute: 'é', ecirc: 'ê', euml: 'ë',
  igrave: 'ì', iacute: 'í', icirc: 'î', iuml: 'ï',
  ograve: 'ò', oacute: 'ó', ocirc: 'ô', otilde: 'õ', ouml: 'ö',
  ugrave: 'ù', uacute: 'ú', ucirc: 'û', uuml: 'ü',
  Agrave: 'À', Aacute: 'Á', Egrave: 'È', Eacute: 'É',
  Igrave: 'Ì', Iacute: 'Í', Ograve: 'Ò', Oacute: 'Ó',
  Ugrave: 'Ù', Uacute: 'Ú',
};

const args = new Set(process.argv.slice(2));
const shouldApply = args.has('--apply');

loadDotEnv('.env.local');

const html = await fetchHtml(ANNOUNCEMENTS_URL);
const comunicati = parseComunicati(html);

if (shouldApply) {
  await applyToSupabase(comunicati);
  process.exit(0);
}

printSummary(comunicati);

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
    throw new Error(`Impossibile scaricare comunicati Enjore: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

function parseComunicati(sourceHtml) {
  const pieces = sourceHtml.split('<div class="docs-list-el">').slice(1);
  const results = [];

  for (const piece of pieces) {
    const labelMatch = piece.match(/<label>([\s\S]*?)<\/label>/);
    const hrefMatch = piece.match(/href="(https:\/\/cdn\.enjore\.com[^"]+\.pdf)"/i);

    if (!labelMatch || !hrefMatch) continue;

    const rawLabel = normalizeSpaces(decodeHtml(stripTags(labelMatch[1])));
    const url = hrefMatch[1];

    // Label may end with "del DD/MM/YYYY"
    const dateMatch = rawLabel.match(/\s+del\s+(\d{2})\/(\d{2})\/(\d{4})\s*$/i);
    let data = null;
    let titolo = rawLabel;

    if (dateMatch) {
      const [, day, month, year] = dateMatch;
      data = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      titolo = rawLabel.slice(0, dateMatch.index).trim();
    }

    results.push({ enjore_url: url, titolo, data });
  }

  return results;
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

  const { error } = await supabase.from('comunicati').upsert(rows, { onConflict: 'enjore_url' });
  if (error) throw error;

  console.log(`Sync comunicati completata: ${rows.length} comunicati upsertati.`);
}

function printSummary(rows) {
  console.log(`Comunicati trovati su Enjore: ${rows.length}`);
  for (const r of rows) {
    console.log(`  [${r.data ?? 'no date'}] ${r.titolo} — ${r.enjore_url}`);
  }
  console.log('');
  console.log('Per applicare: SUPABASE_SERVICE_ROLE_KEY=... node scripts/sync-enjore-comunicati.mjs --apply');
}

function stripTags(value) {
  return String(value).replace(/<[^>]*>/g, ' ');
}

function normalizeSpaces(value) {
  return String(value).replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}

function decodeHtml(value) {
  return String(value).replace(/&(#\d+|#x[0-9a-f]+|[a-z#][a-z0-9]*);/gi, (match, entity) => {
    if (entity.startsWith('#x')) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith('#')) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return HTML_ENTITIES[entity] ?? match;
  });
}
