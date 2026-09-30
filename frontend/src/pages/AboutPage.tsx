import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Cpu,
  Database,
  ExternalLink,
  FileCode2,
  Layers,
  Scale,
  Search,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';

import { Badge, SampleDataBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, InlineNotice, PageTitle } from '@/components/ui/Panel';
import { useHealth } from '@/hooks/useHealth';
import { formatNumber } from '@/lib/format';
import { API_BASE_URL } from '@/services/api';

const PIPELINE = [
  {
    step: '01',
    title: 'Text normalisation',
    body: 'The specification is lower-cased, collapsed and stripped of boilerplate. Procurement phrasing ("we need to purchase", "shall be", "as per") is recognised and separated from the technical content so it does not dilute the match.',
  },
  {
    step: '02',
    title: 'Requirement extraction',
    body: 'A rule-and-lexicon hybrid extractor identifies the product, material, application, sector, product category and quantity, then classifies requirement clauses as technical, safety or performance. Every extracted field carries the confidence behind it.',
  },
  {
    step: '03',
    title: 'Semantic embedding',
    body: 'The normalised query is encoded by a Sentence-Transformers model into a dense 384-dimensional vector. The same model encodes each standard record, so procurement language and catalogue language are compared in one shared space.',
  },
  {
    step: '04',
    title: 'Vector retrieval',
    body: 'A FAISS inner-product index (with a pure-numpy fallback) returns the nearest standard records by cosine similarity. This is the recall stage: it decides which records are worth scoring in detail.',
  },
  {
    step: '05',
    title: 'Multi-factor scoring',
    body: 'Each candidate is scored on six independent signals — semantic similarity, keyword overlap, product match, sector match, requirement match and application match. Weights are configurable per deployment in backend/.env.',
  },
  {
    step: '06',
    title: 'Ranking and explanation',
    body: 'Candidates are ranked by weighted score, filtered at a minimum relevance threshold, and each is given a plain-English reason built from the signals that actually contributed, plus the factors it did not cover.',
  },
];

const LIMITATIONS = [
  'The knowledge base currently holds a small demonstration dataset. It is not the BIS catalogue, and no result should be read as a complete survey of applicable standards.',
  'Similarity is not applicability. A high score means a standard is worth reviewing, not that it is mandatory for your procurement.',
  'Match scores are relative to the loaded dataset. Adding or removing records changes every score.',
  'Standards are frequently amended and revised. The engine works on metadata and cannot reflect the latest amendment status.',
  'The system has not been validated against real tender decisions. It is a decision-support prototype for human review.',
  'No copyright-restricted BIS document text is stored or redistributed — only descriptive metadata.',
];

const ENDPOINTS = [
  { method: 'POST', path: '/api/analyze', purpose: 'Analyse a specification end to end' },
  { method: 'POST', path: '/api/recommendations', purpose: 'Re-score a stored query with corrected requirements' },
  { method: 'GET', path: '/api/standards', purpose: 'Search and filter the knowledge base' },
  { method: 'GET', path: '/api/standards/{id}', purpose: 'Full record with scope, clauses and related standards' },
  { method: 'POST', path: '/api/compare', purpose: 'Side-by-side comparison of 2–4 standards' },
  { method: 'GET', path: '/api/search-history', purpose: 'Stored procurement analyses' },
  { method: 'GET', path: '/api/saved-standards', purpose: 'Shortlist for the current officer' },
  { method: 'GET', path: '/api/analytics', purpose: 'Live dashboard aggregates' },
  { method: 'GET', path: '/api/health', purpose: 'Engine, database and index status' },
];

export function AboutPage() {
  const { data: health } = useHealth(120_000);

  const weights =
    (health?.configuration?.weights as Record<string, number> | undefined) ??
    (health?.configuration?.weights as unknown);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <PageTitle
        title="About this prototype"
        description="How the recommendation engine works, what it can and cannot tell you, and how to replace the sample data with verified records."
      />

      {/* Identity / disclaimer */}
      <Card className="border-amber-200 bg-amber-50">
        <div className="p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="warning" icon={<TriangleAlert aria-hidden className="h-3.5 w-3.5" />}>
              Not an official BIS system
            </Badge>
            <SampleDataBadge />
            <Badge tone="neutral">SIH26108 research prototype</Badge>
          </div>
          <h2 className="mt-3 text-base font-semibold text-amber-950">
            What this system is — and what it is not
          </h2>
          <div className="mt-2 space-y-2.5 text-sm leading-relaxed text-amber-900">
            <p>
              <strong>It is</strong> a decision-support prototype built for Smart India Hackathon
              problem statement SIH26108. It helps a procurement officer narrow a large field of
              standards down to a short, ranked, explained list worth reviewing.
            </p>
            <p>
              <strong>It is not</strong> the Bureau of Indian Standards, is not affiliated with or
              endorsed by BIS, and does not issue certifications, approvals or compliance decisions. A
              match score is the output of a similarity algorithm over a demonstration dataset — it
              is not a statement that a standard applies to your procurement.
            </p>
            <p>
              Always verify the applicable standard, its current edition and any amendments with BIS,
              and have a qualified engineer confirm the technical requirements before finalising a
              tender.
            </p>
            <a
              href="https://www.bis.gov.in"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-semibold underline underline-offset-2"
            >
              Open the official BIS catalogue
              <ExternalLink aria-hidden className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </Card>

      {/* Problem statement */}
      <section className="mt-5">
        <Card>
          <CardHeader title="Problem statement · SIH26108" icon={<BookOpen aria-hidden className="h-4 w-4" />} />
          <div className="p-5">
            <p className="text-sm font-medium leading-relaxed text-slate-800">
              “AI-Powered Recommendation Engine for Identifying Applicable Indian Standards for
              Procurement Specifications.”
            </p>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              Procurement officers must state applicable standards in tender documents, but the BIS
              catalogue is large, organised by committee and product code, and often expressed in
              technical language that does not match how a requirement is described in practice.
              Identifying candidate standards by hand is slow and inconsistent, especially for
              officers who are not domain specialists.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              This project applies natural-language processing and semantic search to bridge that gap:
              an officer writes the requirement in plain English, and the engine returns the
              standards most worth reviewing, with the reasoning shown.
            </p>
          </div>
        </Card>
      </section>

      {/* Pipeline */}
      <section className="mt-5">
        <h2 className="text-base font-semibold text-navy-900">The recommendation pipeline</h2>
        <p className="mt-1 text-sm text-slate-600">
          Every stage below runs for real on each query. Nothing is precomputed or faked.
        </p>
        <ol className="mt-4 space-y-3">
          {PIPELINE.map((stage) => (
            <li key={stage.step}>
              <Card>
                <div className="flex gap-4 p-5">
                  <span className="font-mono text-sm font-bold text-brand-600">{stage.step}</span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-navy-900">{stage.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{stage.body}</p>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      {/* Live engine configuration */}
      <section className="mt-5">
        <Card>
          <CardHeader
            title="Live engine configuration"
            icon={<Cpu aria-hidden className="h-4 w-4" />}
            subtitle="Read from the running backend — these are the values actually in use"
            actions={
              <a href={`${API_BASE_URL}/health`} target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="secondary">
                  Health endpoint
                </Button>
              </a>
            }
          />
          <dl className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
            <ConfigItem label="Embedding model" value={String(health?.engine?.embedding_model ?? '--')} mono />
            <ConfigItem label="Vector backend" value={String(health?.engine?.backend ?? '--')} />
            <ConfigItem label="Embedding dimension" value={String(health?.engine?.dim ?? '--')} />
            <ConfigItem
              label="Standards indexed"
              value={formatNumber((health?.database?.standards_count as number) ?? 0)}
            />
            <ConfigItem label="Minimum relevance" value={String(health?.configuration?.min_relevance ?? '--')} />
            <ConfigItem
              label="Scoring weights"
              value={
                weights && typeof weights === 'object' && !Array.isArray(weights)
                  ? Object.entries(weights)
                      .map(([key, value]) => `${key} ${value}`)
                      .join(' · ')
                  : '--'
              }
            />
          </dl>
          <div className="border-t border-slate-200 p-5">
            <ScoreWeightTable />
          </div>
        </Card>
      </section>

      {/* Architecture */}
      <section className="mt-5">
        <Card>
          <CardHeader title="Architecture" icon={<Layers aria-hidden className="h-4 w-4" />} />
          <div className="p-5">
            <pre className="overflow-x-auto rounded-md bg-slate-900 p-4 text-xs leading-relaxed text-slate-100">
{`React + TypeScript SPA  (Vite, Tailwind, Recharts)
        |  REST / JSON  (X-User-Id scoped)
        v
FastAPI backend  ── CORS · rate limiting · error envelope
        |
        ├── NLP pipeline ........ requirement extraction & normalisation
        ├── Sentence-Transformers  384-dim embeddings
        ├── FAISS vector index ..... cosine candidate retrieval
        ├── Scoring engine ......... 6 weighted factors + explanation
        |
        v
MySQL / MariaDB  ── standards · keywords · requirements
                              · procurement_queries · recommendations
                              · saved_standards · users`}
            </pre>
          </div>
        </Card>
      </section>

      {/* Data sourcing */}
      <section className="mt-5">
        <Card>
          <CardHeader title="Data sourcing and ingestion" icon={<Database aria-hidden className="h-4 w-4" />} />
          <div className="space-y-3 p-5 text-sm leading-relaxed text-slate-600">
            <p>
              This prototype stores <strong>descriptive metadata only</strong> — reference number,
              title, sector, product category, a scope summary, keywords and clause summaries. It
              does not store or redistribute copyrighted BIS document text.
            </p>
            <p>
              The bundled dataset is a clearly labelled demonstration set so the application works
              immediately after installation. It is not derived from, and must not be presented as,
              official BIS records.
            </p>
            <p>To use real data, export a permitted catalogue listing and import it:</p>
            <pre className="overflow-x-auto rounded-md bg-slate-100 p-3.5 text-xs text-slate-800">
{`python scripts/import_standards.py --csv data/your-standards.csv
python scripts/import_standards.py --xlsx data/your-standards.xlsx
python scripts/import_standards.py --json data/your-standards.json`}
            </pre>
            <p className="flex items-start gap-1.5 text-xs text-slate-500">
              <FileCode2 aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Each imported record keeps its own <code className="font-mono">source</code> and{' '}
              <code className="font-mono">source_url</code> attribution, which is shown on every
              standard detail page. Records with <code className="font-mono">is_demonstration =
              false</code> are displayed as verified catalogue data rather than sample records.
            </p>
          </div>
        </Card>
      </section>

      {/* Limitations */}
      <section className="mt-5">
        <Card>
          <CardHeader title="Known limitations" icon={<TriangleAlert aria-hidden className="h-4 w-4" />} />
          <ul className="space-y-2.5 p-5">
            {LIMITATIONS.map((item) => (
              <li key={item} className="flex gap-2.5 text-sm leading-relaxed text-slate-600">
                <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      {/* API surface */}
      <section className="mt-5">
        <Card>
          <CardHeader
            title="API surface"
            icon={<Search aria-hidden className="h-4 w-4" />}
            subtitle="Interactive OpenAPI documentation is served by the backend at /docs"
            actions={
              <a href="http://127.0.0.1:8000/docs" target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="secondary" icon={<ExternalLink aria-hidden className="h-3.5 w-3.5" />}>
                  Open /docs
                </Button>
              </a>
            }
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <th scope="col" className="px-4 py-2.5 font-semibold">Method</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Endpoint</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Purpose</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ENDPOINTS.map((endpoint) => (
                  <tr key={`${endpoint.method} ${endpoint.path}`}>
                    <td className="px-4 py-2.5">
                      <span
                        className={`rounded px-1.5 py-0.5 font-mono text-[11px] font-bold ${
                          endpoint.method === 'GET'
                            ? 'bg-brand-50 text-brand-800'
                            : 'bg-success-50 text-success-700'
                        }`}
                      >
                        {endpoint.method}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{endpoint.path}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-600">{endpoint.purpose}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      {/* Responsible use */}
      <section className="mt-5">
        <Card className="border-brand-200 bg-brand-50">
          <div className="p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-brand-900">
              <Scale aria-hidden className="h-4 w-4" />
              Intended use
            </h2>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <div className="rounded-md bg-white p-3.5">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-success-700">
                  <CheckCircle2 aria-hidden className="h-3.5 w-3.5" />
                  Good use
                </p>
                <ul className="mt-1.5 space-y-1 text-xs leading-relaxed text-slate-600">
                  <li>Shortlisting which standards to read first</li>
                  <li>Drafting preliminary tender specifications</li>
                  <li>Training and demonstrating the matching approach</li>
                  <li>Identifying which sectors need data import</li>
                </ul>
              </div>
              <div className="rounded-md bg-white p-3.5">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-red-700">
                  <TriangleAlert aria-hidden className="h-3.5 w-3.5" />
                  Not appropriate
                </p>
                <ul className="mt-1.5 space-y-1 text-xs leading-relaxed text-slate-600">
                  <li>Declaring that a standard is mandatory</li>
                  <li>Proving compliance or certifying a product</li>
                  <li>Replacing a qualified engineer's judgement</li>
                  <li>Substituting for the official BIS catalogue</li>
                </ul>
              </div>
            </div>
          </div>
        </Card>
      </section>

      <div className="mt-5 flex flex-wrap gap-2">
        <Link to="/new-query">
          <Button icon={<Sparkles aria-hidden className="h-4 w-4" />}>Run a query</Button>
        </Link>
        <Link to="/explorer">
          <Button variant="secondary" icon={<Database aria-hidden className="h-4 w-4" />}>
            Browse standards
          </Button>
        </Link>
        <Link to="/settings">
          <Button variant="ghost" icon={<ShieldCheck aria-hidden className="h-4 w-4" />}>
            System settings
          </Button>
        </Link>
      </div>

      <div className="mt-5">
        <InlineNotice tone="info" title="Suggested next step">
          <p className="flex items-center gap-1">
            Import verified metadata for your sector and watch the rankings become genuinely useful.
            <ArrowRight aria-hidden className="h-3 w-3" />
          </p>
        </InlineNotice>
      </div>
    </div>
  );
}

function ConfigItem({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={`mt-1 break-words text-sm text-slate-800 ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  );
}

/** Static reference for how the six factors are weighted by default. */
function ScoreWeightTable() {
  const factors = [
    { factor: 'Semantic similarity', defaultWeight: 0.4, description: 'Cosine similarity between the query embedding and the standard record embedding.' },
    { factor: 'Keyword overlap', defaultWeight: 0.15, description: 'Weighted term overlap between extracted keywords and the standard keyword set.' },
    { factor: 'Product match', defaultWeight: 0.15, description: 'Similarity between the detected product and the standard product/category.' },
    { factor: 'Requirement match', defaultWeight: 0.15, description: 'Coverage of the extracted requirements by the standard clause summaries.' },
    { factor: 'Sector match', defaultWeight: 0.1, description: 'Agreement between the detected sector and the standard sector.' },
    { factor: 'Application match', defaultWeight: 0.05, description: 'Alignment between the intended application and the standard scope.' },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            <th scope="col" className="py-2 pr-4 font-semibold">Factor</th>
            <th scope="col" className="py-2 pr-4 font-semibold">Default weight</th>
            <th scope="col" className="py-2 font-semibold">What it measures</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {factors.map((factor) => (
            <tr key={factor.factor}>
              <td className="py-2.5 pr-4 text-xs font-medium text-slate-800">{factor.factor}</td>
              <td className="py-2.5 pr-4">
                <div className="flex items-center gap-2">
                  <span className="w-9 text-xs font-semibold tabular-nums text-slate-700">
                    {(factor.defaultWeight * 100).toFixed(0)}%
                  </span>
                  <span className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200">
                    <span
                      className="block h-full rounded-full bg-brand-600"
                      style={{ width: `${factor.defaultWeight * 250}%` }}
                    />
                  </span>
                </div>
              </td>
              <td className="py-2.5 text-xs leading-relaxed text-slate-600">{factor.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
