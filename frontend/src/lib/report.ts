/**
 * Builds a self-contained HTML report from an applicability result so the
 * officer can download it without any backend involvement.
 */
import type { AnalysisResult, Assessment } from '@/lib/types';
import { STATUS_ORDER } from '@/lib/types';
import { STATUS_LABEL } from '@/types/applicability';

export interface ReportDecision {
  decision: string;
  note: string;
}

const esc = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const checkLabel = (result: string): string =>
  result === 'match' ? 'Match' : result === 'missing' ? 'Not stated' : result === 'excluded' ? 'Excluded' : 'Conflict';

function standardBlock(assessment: Assessment, decision: ReportDecision | undefined): string {
  const checks = assessment.checks
    .map(
      (check) => `
      <tr>
        <td>${esc(check.label)}</td>
        <td>${esc(check.requirement_value ?? 'not stated')}</td>
        <td>${esc(check.standard_condition)}</td>
        <td><strong>${checkLabel(check.result)}</strong></td>
        <td>${esc(check.clause ?? '-')}</td>
      </tr>`,
    )
    .join('');

  const versions = assessment.versions
    .map((v) => `<li>${esc(v.edition)} - ${esc(v.status)}</li>`)
    .join('');

  const related = assessment.related
    .map((r) => `<li><strong>${esc(r.relationship)}</strong> &rarr; ${esc(r.edition)} - ${esc(r.title)}</li>`)
    .join('');

  return `
    <section class="standard">
      <h3>${esc(assessment.edition)} - ${esc(assessment.title)}</h3>
      <p class="status">${esc(assessment.status_label)}</p>
      <p>${esc(assessment.reason)}</p>
      ${assessment.why_not_applicable ? `<p><strong>Why not:</strong> ${esc(assessment.why_not_applicable)}</p>` : ''}
      <table>
        <thead>
          <tr><th>Condition</th><th>Your requirement</th><th>Standard condition</th><th>Result</th><th>Clause</th></tr>
        </thead>
        <tbody>${checks}</tbody>
      </table>
      ${versions ? `<p class="meta"><strong>Version information</strong></p><ul>${versions}</ul>` : ''}
      ${related ? `<p class="meta"><strong>Related standards</strong></p><ul>${related}</ul>` : ''}
      ${
        decision
          ? `<p class="decision"><strong>Officer decision:</strong> ${esc(decision.decision)}${
              decision.note ? ` - ${esc(decision.note)}` : ''
            }</p>`
          : `<p class="decision muted">Officer decision: pending</p>`
      }
    </section>`;
}

export function buildReportHtml(
  result: AnalysisResult,
  decisions: Record<string, ReportDecision>,
): string {
  const generatedAt = new Date();
  const fields = result.fields
    .map(
      (field) =>
        `<tr><td>${esc(field.label)}</td><td>${esc(field.value ?? 'Not specified')}</td></tr>`,
    )
    .join('');

  const groups = STATUS_ORDER.map((status) => {
    const items = result.candidates.filter((candidate) => candidate.status === status);
    if (items.length === 0) return '';
    return `
      <h2>${esc(STATUS_LABEL[status])} (${items.length})</h2>
      ${items
        .map((item) => standardBlock(item, decisions[item.standard_id]))
        .join('')}`;
  }).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Procurement Standards Report - ${esc(generatedAt.toLocaleString('en-IN'))}</title>
<style>
  body { font-family: Inter, Segoe UI, Arial, sans-serif; color: #0f1c33; margin: 40px auto; max-width: 900px; padding: 0 24px; line-height: 1.55; }
  h1 { font-size: 24px; margin-bottom: 4px; }
  h2 { font-size: 18px; margin-top: 32px; padding-bottom: 6px; border-bottom: 2px solid #e2e8f0; }
  h3 { font-size: 15px; margin-top: 22px; margin-bottom: 4px; }
  .sub { color: #64748b; font-size: 13px; }
  .status { display: inline-block; background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 4px; padding: 2px 8px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; }
  .standard { border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; margin-top: 12px; background: #fff; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12.5px; }
  th, td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f8fafc; }
  .meta { margin-top: 12px; font-size: 13px; }
  ul { font-size: 13px; margin-top: 4px; }
  .decision { margin-top: 10px; font-size: 13px; background: #f8fafc; border-left: 3px solid #2563eb; padding: 8px 10px; }
  .decision.muted { color: #64748b; border-left-color: #cbd5e1; }
  .box { border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; background: #f8fafc; }
  footer { margin-top: 36px; font-size: 11.5px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 14px; }
</style>
</head>
<body>
<h1>Procurement Standards Report</h1>
<p class="sub">Generated ${esc(generatedAt.toLocaleString('en-IN'))} &middot; IS Applicability Engine (SIH26108 prototype)</p>

<h2>Procurement requirement</h2>
<div class="box">
  <p><strong>Product:</strong> ${esc(result.product_name || 'Not stated')}</p>
  <p>${esc(result.specification)}</p>
</div>

<h2>Extracted technical details</h2>
<table><tbody>${fields}</tbody></table>

${groups}

<footer>
  ${esc(result.disclaimer)}
</footer>
</body>
</html>`;
}

/** Triggers a browser download of the generated report. */
export function downloadReport(result: AnalysisResult, decisions: Record<string, ReportDecision>): void {
  const html = buildReportHtml(result, decisions);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  anchor.href = url;
  anchor.download = `procurement-standards-report-${stamp}.html`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
