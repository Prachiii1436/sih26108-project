import { useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Cpu,
  Database,
  KeyRound,
  Monitor,
  RefreshCw,
  Server,
  TriangleAlert,
  User,
} from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, InlineNotice, PageTitle } from '@/components/ui/Panel';
import { useHealth } from '@/hooks/useHealth';
import { formatDateTime, formatNumber } from '@/lib/format';
import { API_BASE_URL, USER_EMAIL, USER_ID } from '@/services/api';

export function SettingsPage() {
  const { data: health, error, isLoading, refresh } = useHealth(30_000);
  const [showRaw, setShowRaw] = useState(false);

  const db = health?.database ?? {};
  const engine = health?.engine ?? {};
  const config = health?.configuration ?? {};

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <PageTitle
        title="Settings & System Status"
        description="Runtime configuration reported by the backend, plus the identity this session uses for history and shortlists."
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={refresh}
            loading={isLoading}
            icon={<RefreshCw aria-hidden className="h-3.5 w-3.5" />}
          >
            Refresh status
          </Button>
        }
      />

      {/* Engine status */}
      <Card className="mb-5">
        <CardHeader
          title="Recommendation engine"
          icon={<Server aria-hidden className="h-4 w-4" />}
          actions={
            <Badge tone={health?.status === 'ok' ? 'success' : 'danger'}>
              {health?.status ?? (error ? 'unreachable' : 'checking...')}
            </Badge>
          }
        />
        {error ? (
          <div className="p-5">
            <InlineNotice tone="danger" title="Backend unreachable">
              <p>{error.message}</p>
              <p className="mt-2">
                Start the FastAPI backend, then press Refresh. Typical command:
              </p>
              <pre className="mt-1.5 overflow-x-auto rounded bg-slate-100 p-2.5 text-[11px] text-slate-800">
                cd backend && python run.py
              </pre>
            </InlineNotice>
          </div>
        ) : (
          <dl className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
            <StatusItem icon={Database} label="Database" value={String(db.target ?? '--')} />
            <StatusItem icon={CheckCircle2} label="Connection" value={String(db.message ?? '--')} />
            <StatusItem icon={Activity} label="Server version" value={String(db.server_version ?? '--')} />
            <StatusItem
              icon={Database}
              label="Standards in knowledge base"
              value={formatNumber((db.standards_count as number) ?? 0)}
            />
            <StatusItem icon={Cpu} label="Vector backend" value={String(engine.backend ?? '--')} />
            <StatusItem
              icon={Cpu}
              label="Vector index"
              value={`${formatNumber((engine.size as number) ?? 0)} vectors · dim ${String(engine.dim ?? '--')}`}
            />
            <StatusItem icon={Cpu} label="Embedding model" value={String(engine.embedding_model ?? '--')} />
            <StatusItem
              icon={Cpu}
              label="Embedding runtime"
              value={
                engine.embedding_is_fallback
                  ? 'Offline fallback (no model files)'
                  : String(engine.embedding_backend ?? '--')
              }
            />
            <StatusItem icon={User} label="Environment" value={String(config.app_env ?? '--')} />
          </dl>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Session identity */}
        <Card>
          <CardHeader title="Session identity" icon={<User aria-hidden className="h-4 w-4" />} />
          <div className="p-5">
            <p className="text-sm leading-relaxed text-slate-600">
              This prototype identifies the acting officer with a header so search history and
              shortlists stay separate per user. Configure it with the{' '}
              <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px]">VITE_USER_ID</code>{' '}
              environment variable in{' '}
              <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px]">
                frontend/.env
              </code>
              .
            </p>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">User id</dt>
                <dd className="mt-0.5 font-mono text-sm text-slate-800">{USER_ID}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Email</dt>
                <dd className="mt-0.5 break-all font-mono text-xs text-slate-800">{USER_EMAIL}</dd>
              </div>
            </dl>
            <div className="mt-4">
              <InlineNotice tone="warning" title="Demo authentication">
                <p>
                  Set <code className="font-mono">AUTH_REQUIRED=true</code> on the backend to require an
                  identity, and place a real JWT / OIDC verifier in front of it before exposing this
                  service outside a trusted network. No credentials are stored in the browser and no
                  secret is ever sent to the frontend.
                </p>
              </InlineNotice>
            </div>
          </div>
        </Card>

        {/* Frontend config */}
        <Card>
          <CardHeader title="Frontend configuration" icon={<Monitor aria-hidden className="h-4 w-4" />} />
          <div className="p-5">
            <dl className="grid gap-3">
              <ConfigRow label="VITE_API_URL" value={import.meta.env.VITE_API_URL || `${API_BASE_URL} (auto)`} />
              <ConfigRow label="VITE_USER_ID" value={import.meta.env.VITE_USER_ID || '1 (default)'} />
              <ConfigRow
                label="VITE_API_TIMEOUT_MS"
                value={import.meta.env.VITE_API_TIMEOUT_MS || '120000 (default)'}
              />
              <ConfigRow label="Mode" value={import.meta.env.MODE} />
            </dl>
            <p className="mt-4 text-xs leading-relaxed text-slate-500">
              Copy <code className="rounded bg-slate-100 px-1 py-0.5 font-mono">frontend/.env.example</code>{' '}
              to <code className="rounded bg-slate-100 px-1 py-0.5 font-mono">frontend/.env</code> to
              change these. In development, requests go through the Vite proxy at{' '}
              <code className="rounded bg-slate-100 px-1 py-0.5 font-mono">/api</code>, so no CORS
              configuration is needed.
            </p>
          </div>
        </Card>
      </div>

      {/* Engine tuning */}
      <Card className="mt-5">
        <CardHeader
          title="Engine tuning"
          icon={<Cpu aria-hidden className="h-4 w-4" />}
          subtitle="Values are read from the running backend and configured in backend/.env"
        />
        <div className="p-5">
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <ConfigRow
              label="Minimum relevance"
              value={String(config.min_relevance ?? '--')}
              hint="Results below this score are not returned"
            />
            <ConfigRow label="Default results" value={String(config.default_top_k ?? '5')} />
            <ConfigRow label="Auth required" value={String(config.auth_required ?? 'false')} />
            <ConfigRow label="Demo mode" value={String(config.demo_mode ?? 'true')} />
            <ConfigRow label="AI provider" value={String(config.ai_provider ?? 'local-embeddings')} />
            <ConfigRow label="Vector backend" value={String(config.vector_backend ?? 'auto')} />
            <ConfigRow label="MySQL port" value={String(config.mysql_port ?? '--')} />
            <ConfigRow
              label="Index built at"
              value={formatDateTime(engine.built_at as string)}
            />
          </dl>
        </div>
      </Card>

      {/* Raw payload */}
      <Card className="mt-5">
        <CardHeader
          title="Raw /api/health payload"
          icon={<KeyRound aria-hidden className="h-4 w-4" />}
          subtitle="Exactly what the backend reports — useful when debugging a local setup"
          actions={
            <Button variant="secondary" size="sm" onClick={() => setShowRaw((open) => !open)}>
              {showRaw ? 'Hide' : 'Show'}
            </Button>
          }
        />
        {showRaw ? (
          <pre className="max-h-96 overflow-auto bg-slate-900 p-4 text-xs leading-relaxed text-slate-100">
            {JSON.stringify(health ?? { error: error?.message ?? 'no response' }, null, 2)}
          </pre>
        ) : null}
      </Card>

      <div className="mt-5">
        <InlineNotice tone="warning" title="Prototype scope" icon={<TriangleAlert aria-hidden className="h-3.5 w-3.5" />}>
          <p>
            This deployment is a Smart India Hackathon research prototype. It is not an official BIS
            system, produces no certification or compliance decision, and currently runs against a
            demonstration dataset. Verify all standards and their current editions directly with the
            Bureau of Indian Standards.
          </p>
        </InlineNotice>
      </div>
    </div>
  );
}

function StatusItem({ icon: Icon, label, value }: { icon: typeof Database; label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <Icon aria-hidden className="h-3.5 w-3.5" />
        {label}
      </dt>
      <dd className="mt-1 break-words font-mono text-xs text-slate-800">{value}</dd>
    </div>
  );
}

function ConfigRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 break-all font-mono text-xs text-slate-800">{value}</dd>
      {hint ? <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p> : null}
    </div>
  );
}
