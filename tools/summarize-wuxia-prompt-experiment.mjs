#!/usr/bin/env node

import fs from 'node:fs';

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('用法: node tools/summarize-wuxia-prompt-experiment.mjs <report.json> [...]');
  process.exit(1);
}

function extractBetween(text, start, end) {
  const startIndex = text.indexOf(start);
  if (startIndex < 0) return '';
  const endIndex = text.indexOf(end, startIndex + start.length);
  return text.slice(startIndex, endIndex < 0 ? undefined : endIndex + end.length).trim();
}

function extractDraft(output) {
  const markdown = extractBetween(output, '【武侠事件草稿】', '06.');
  if (markdown) {
    const start = output.indexOf('【武侠事件草稿】');
    const planningEnd = output.indexOf('</konatan_planning', start);
    return output.slice(start, planningEnd < 0 ? undefined : planningEnd).trim();
  }

  const xml = extractBetween(output, '<wuxia_event_draft>', '</wuxia_event_draft>');
  if (xml) return xml;

  const jsonMarker = output.indexOf('"WUXIA_EVENT_DRAFT"');
  if (jsonMarker >= 0) {
    const start = output.lastIndexOf('{', jsonMarker);
    const planningEnd = output.indexOf('</konatan_planning', jsonMarker);
    return output.slice(start < 0 ? jsonMarker : start, planningEnd < 0 ? undefined : planningEnd).trim();
  }

  const gateStart = output.indexOf('PREWRITE_EVENT_GATE');
  if (gateStart >= 0) {
    const planningEnd = output.indexOf('</konatan_planning', gateStart);
    return output.slice(gateStart, planningEnd < 0 ? undefined : planningEnd).trim();
  }

  return '';
}

function stripNonBody(text) {
  return text
    .replace(/<Variable(?:Think|Edit|Insert|Delete)>[\s\S]*?<\/Variable(?:Think|Edit|Insert|Delete)>/g, '')
    .replace(/<tucao>[\s\S]*?<\/tucao>/g, '')
    .replace(/<StatusPlaceHolderImpl\/>/g, '')
    .trim();
}

function bodyAfterPlanning(output) {
  const match = output.match(/<\/konatan_planning~?>/);
  if (!match || match.index == null) return '';
  return stripNonBody(output.slice(match.index + match[0].length));
}

for (const file of files) {
  const report = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const turn of report.turns ?? []) {
    const output = turn.debug?.['main-output']?.content ?? '';
    const draft = extractDraft(output);
    const body = bodyAfterPlanning(output);
    const numberedFields = Array.from({ length: 6 }, (_, index) => {
      const number = String(index + 1).padStart(2, '0');
      return new RegExp(`(?:^|\\n)${number}\\.`).test(draft);
    });
    const xmlFields = ['event_stage', 'direct_consequence', 'completion', 'time_equation', 'boundary', 'outcome'].map(
      field => new RegExp(`<${field}>[^<\\n]+<\\/${field}>`).test(draft),
    );
    const gateFields = Array.from({ length: 6 }, (_, index) => draft.includes(`[${index + 1}/6]`));
    const filledFieldCount = Math.max(
      numberedFields.filter(Boolean).length,
      xmlFields.filter(Boolean).length,
      gateFields.filter(Boolean).length,
      draft.includes('"WUXIA_EVENT_DRAFT"')
        ? ['event_stage', 'direct_consequence', 'completion', 'time', 'boundary', 'outcome'].filter(field =>
            draft.includes(`"${field}"`),
          ).length
        : 0,
    );

    const variableBlocks = [...output.matchAll(/<(Variable(?:Think|Edit|Insert|Delete))>([\s\S]*?)<\/\1>/g)].map(
      match => `${match[1]}: ${match[2].trim().replace(/\s+/g, ' ')}`,
    );

    console.log(
      JSON.stringify(
        {
          file,
          turn: turn.turn,
          success: turn.success,
          generationMs: turn.generationMs,
          draftTriggered: Boolean(draft),
          filledFieldCount,
          bodyPresent: body.length >= 80,
          bodyChars: body.length,
          draft,
          variableBlocks,
          failedSections: turn.failedSections ?? [],
        },
        null,
        2,
      ),
    );
  }
}
