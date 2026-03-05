/**
 * Deployment Dashboard Page
 * Week 7 Day 6: Deployment Dashboard & Release Management
 *
 * Admin page for monitoring deployments across environments, viewing
 * build pipeline status, release history, and performing rollbacks.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { API } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';

// ─── Types ───────────────────────────────────────────────────────────────────

type Environment = 'development' | 'staging' | 'production';
type DeploymentStatus =
  | 'pending'
  | 'building'
  | 'deploying'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'rolled_back';
type TabId = 'overview' | 'deployments' | 'releases' | 'compare';

interface ServiceHealth {
  name: string;
  status: 'ok' | 'degraded' | 'down';
  latencyMs: number;
  version?: string;
  lastChecked: string;
}

interface EnvironmentMetrics {
  requestsPerSecond: number;
  errorRate: number;
  avgResponseTime: number;
  p95ResponseTime: number;
  activeConnections: number;
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
}

interface EnvironmentStatus {
  environment: Environment;
  currentVersion: string;
  currentCommit: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  lastDeployedAt: string;
  lastDeployedBy: string;
  uptime: number;
  services: ServiceHealth[];
  metrics: EnvironmentMetrics;
}

interface BuildStep {
  stage: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  logs?: string[];
}

interface Deployment {
  id: string;
  environment: Environment;
  version: string;
  gitCommit: string;
  gitBranch: string;
  gitMessage: string;
  status: DeploymentStatus;
  deployedBy: string;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  buildSteps: BuildStep[];
  rollbackTarget?: string;
}

interface Release {
  id: string;
  version: string;
  tag: string;
  title: string;
  description: string;
  changelog: string[];
  createdAt: string;
  createdBy: string;
  deployments: { environment: Environment; deployedAt: string; status: DeploymentStatus }[];
}

interface DeploymentStats {
  totalDeployments: number;
  successRate: number;
  avgDeployTime: number;
  rollbackCount: number;
  deploymentsByEnvironment: Record<Environment, number>;
  deploymentsByStatus: Partial<Record<DeploymentStatus, number>>;
  recentFailures: Deployment[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
};

const formatUptime = (seconds: number): string => {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

const timeAgo = (date: string): string => {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const statusColor = (status: string): string => {
  switch (status) {
    case 'healthy':
    case 'ok':
    case 'succeeded':
    case 'success':
    case 'running':
      return 'text-green-400';
    case 'degraded':
    case 'building':
    case 'deploying':
    case 'pending':
      return 'text-yellow-400';
    case 'unhealthy':
    case 'down':
    case 'failed':
      return 'text-red-400';
    case 'rolled_back':
      return 'text-blue-400';
    case 'skipped':
      return 'text-gray-500';
    default:
      return 'text-gray-400';
  }
};

const statusBg = (status: string): string => {
  switch (status) {
    case 'healthy':
    case 'succeeded':
      return 'bg-green-500/10 border-green-500/30';
    case 'degraded':
    case 'building':
      return 'bg-yellow-500/10 border-yellow-500/30';
    case 'unhealthy':
    case 'failed':
      return 'bg-red-500/10 border-red-500/30';
    case 'rolled_back':
      return 'bg-blue-500/10 border-blue-500/30';
    default:
      return 'bg-gray-500/10 border-gray-500/30';
  }
};

const statusIcon = (status: string): string => {
  switch (status) {
    case 'healthy':
    case 'ok':
    case 'succeeded':
    case 'success':
      return '✅';
    case 'degraded':
    case 'building':
    case 'deploying':
      return '🔶';
    case 'pending':
    case 'running':
      return '⏳';
    case 'unhealthy':
    case 'down':
    case 'failed':
      return '❌';
    case 'rolled_back':
      return '⏪';
    case 'skipped':
      return '⏭️';
    default:
      return '❓';
  }
};

const envEmoji = (env: Environment): string => {
  switch (env) {
    case 'development':
      return '🛠️';
    case 'staging':
      return '🧪';
    case 'production':
      return '🚀';
  }
};

// ─── Sub-components ──────────────────────────────────────────────────────────

const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => (
  <div className={`bg-slate-800 rounded-lg border border-slate-700 p-4 ${className}`}>
    {children}
  </div>
);

const MetricBox: React.FC<{
  label: string;
  value: string | number;
  suffix?: string;
  color?: string;
}> = ({ label, value, suffix, color = 'text-white' }) => (
  <div className="text-center">
    <div className={`text-xl font-bold ${color}`}>
      {value}
      {suffix && <span className="text-sm font-normal text-slate-400"> {suffix}</span>}
    </div>
    <div className="text-xs text-slate-500 mt-1">{label}</div>
  </div>
);

// ─── Environment Overview Tab ────────────────────────────────────────────────

const EnvironmentOverview: React.FC<{
  envStatuses: EnvironmentStatus[];
  stats: DeploymentStats | null;
}> = ({ envStatuses, stats }) => (
  <div className="space-y-6">
    {/* Environment cards */}
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {envStatuses.map((env) => (
        <Card key={env.environment} className={`border ${statusBg(env.status)}`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-white">
              {envEmoji(env.environment)} {env.environment}
            </h3>
            <span className={`text-sm font-medium ${statusColor(env.status)}`}>
              {statusIcon(env.status)} {env.status}
            </span>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Version</span>
              <span className="text-white font-mono">{env.currentVersion}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Commit</span>
              <span className="text-cyan-400 font-mono">{env.currentCommit}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Deployed</span>
              <span className="text-white">{timeAgo(env.lastDeployedAt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Uptime</span>
              <span className="text-white">{formatUptime(env.uptime)}</span>
            </div>
          </div>

          {/* Service health indicators */}
          <div className="mt-3 pt-3 border-t border-slate-700">
            <div className="text-xs text-slate-500 mb-2">Services</div>
            <div className="flex gap-2 flex-wrap">
              {env.services.map((svc) => (
                <span
                  key={svc.name}
                  className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                    svc.status === 'ok'
                      ? 'bg-green-500/20 text-green-400'
                      : svc.status === 'degraded'
                        ? 'bg-yellow-500/20 text-yellow-400'
                        : 'bg-red-500/20 text-red-400'
                  }`}
                >
                  {svc.name} ({svc.latencyMs}ms)
                </span>
              ))}
            </div>
          </div>

          {/* Key metrics */}
          <div className="mt-3 pt-3 border-t border-slate-700 grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-slate-500">RPS</span>{' '}
              <span className="text-white">{env.metrics.requestsPerSecond}</span>
            </div>
            <div>
              <span className="text-slate-500">Error</span>{' '}
              <span className="text-white">{(env.metrics.errorRate * 100).toFixed(2)}%</span>
            </div>
            <div>
              <span className="text-slate-500">CPU</span>{' '}
              <span className="text-white">{env.metrics.cpuUsage}%</span>
            </div>
            <div>
              <span className="text-slate-500">Memory</span>{' '}
              <span className="text-white">{env.metrics.memoryUsage}%</span>
            </div>
          </div>
        </Card>
      ))}
    </div>

    {/* Deployment stats */}
    {stats && (
      <Card>
        <h3 className="text-lg font-semibold text-white mb-4">
          📊 Deployment Statistics (30 days)
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricBox
            label="Total Deployments"
            value={stats.totalDeployments}
            color="text-cyan-400"
          />
          <MetricBox
            label="Success Rate"
            value={`${(stats.successRate * 100).toFixed(1)}%`}
            color={stats.successRate > 0.9 ? 'text-green-400' : 'text-yellow-400'}
          />
          <MetricBox
            label="Avg Deploy Time"
            value={formatDuration(stats.avgDeployTime)}
            color="text-white"
          />
          <MetricBox
            label="Rollbacks"
            value={stats.rollbackCount}
            color={stats.rollbackCount === 0 ? 'text-green-400' : 'text-yellow-400'}
          />
        </div>
      </Card>
    )}
  </div>
);

// ─── Deployment List Tab ─────────────────────────────────────────────────────

const DeploymentList: React.FC<{
  deployments: Deployment[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRollback: (id: string, env: Environment) => void;
}> = ({ deployments, selectedId, onSelect, onRollback }) => (
  <div className="space-y-4">
    {/* Deployment timeline */}
    <div className="space-y-3">
      {deployments.map((dep) => (
        <Card
          key={dep.id}
          className={`cursor-pointer transition-colors hover:border-cyan-500/50 ${
            selectedId === dep.id ? 'border-cyan-500' : ''
          }`}
        >
          <div onClick={() => onSelect(dep.id)}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <span>{envEmoji(dep.environment)}</span>
                <div>
                  <span className="text-white font-semibold">v{dep.version}</span>
                  <span className="text-slate-500 mx-2">→</span>
                  <span className="text-slate-300">{dep.environment}</span>
                </div>
              </div>
              <span className={`text-sm font-medium ${statusColor(dep.status)}`}>
                {statusIcon(dep.status)} {dep.status}
              </span>
            </div>

            <div className="flex items-center gap-4 text-xs text-slate-400">
              <span className="font-mono text-cyan-400">{dep.gitCommit.slice(0, 7)}</span>
              <span>{dep.gitBranch}</span>
              <span>by {dep.deployedBy}</span>
              <span>{timeAgo(dep.startedAt)}</span>
              {dep.durationMs && <span>{formatDuration(dep.durationMs)}</span>}
            </div>

            <p className="text-sm text-slate-300 mt-1 truncate">{dep.gitMessage}</p>
          </div>

          {/* Expanded: build pipeline */}
          {selectedId === dep.id && (
            <div className="mt-4 pt-4 border-t border-slate-700">
              <div className="text-xs text-slate-500 mb-2">Build Pipeline</div>
              <div className="flex gap-1 flex-wrap">
                {dep.buildSteps.map((step) => (
                  <div
                    key={step.stage}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${
                      step.status === 'success'
                        ? 'bg-green-500/20 text-green-400'
                        : step.status === 'failed'
                          ? 'bg-red-500/20 text-red-400'
                          : step.status === 'running'
                            ? 'bg-yellow-500/20 text-yellow-400'
                            : step.status === 'skipped'
                              ? 'bg-slate-700 text-slate-500'
                              : 'bg-slate-700 text-slate-400'
                    }`}
                    title={step.durationMs ? formatDuration(step.durationMs) : step.status}
                  >
                    {statusIcon(step.status)} {step.stage}
                    {step.durationMs !== undefined && (
                      <span className="text-slate-500 ml-1">
                        ({formatDuration(step.durationMs)})
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* Rollback button — only for succeeded deployments */}
              {dep.status === 'succeeded' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRollback(dep.id, dep.environment);
                  }}
                  className="mt-3 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                >
                  ⏪ Rollback to this version
                </button>
              )}
            </div>
          )}
        </Card>
      ))}
    </div>
  </div>
);

// ─── Release History Tab ─────────────────────────────────────────────────────

const ReleaseHistory: React.FC<{ releases: Release[] }> = ({ releases }) => (
  <div className="space-y-4">
    {releases.map((release) => (
      <Card key={release.id}>
        <div className="flex items-center justify-between mb-2">
          <div>
            <span className="text-lg font-bold text-cyan-400">{release.tag}</span>
            <span className="text-white ml-3">{release.title}</span>
          </div>
          <span className="text-xs text-slate-500">{timeAgo(release.createdAt)}</span>
        </div>

        <p className="text-sm text-slate-400 mb-3">{release.description}</p>

        {/* Changelog */}
        <div className="mb-3">
          <div className="text-xs text-slate-500 mb-1">Changelog</div>
          <ul className="list-disc list-inside text-sm text-slate-300 space-y-0.5">
            {release.changelog.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>

        {/* Deployment status per environment */}
        <div className="flex gap-2 flex-wrap">
          {release.deployments.map((dep) => (
            <span
              key={dep.environment}
              className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded ${
                dep.status === 'succeeded'
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-yellow-500/20 text-yellow-400'
              }`}
            >
              {envEmoji(dep.environment)} {dep.environment} — {timeAgo(dep.deployedAt)}
            </span>
          ))}
        </div>
      </Card>
    ))}
  </div>
);

// ─── Environment Comparison Tab ──────────────────────────────────────────────

const EnvironmentCompare: React.FC<{ envStatuses: EnvironmentStatus[] }> = ({ envStatuses }) => {
  const headers = [
    'Metric',
    ...envStatuses.map((e) => `${envEmoji(e.environment)} ${e.environment}`),
  ];

  const rows = [
    ['Version', ...envStatuses.map((e) => e.currentVersion)],
    ['Commit', ...envStatuses.map((e) => e.currentCommit)],
    ['Status', ...envStatuses.map((e) => `${statusIcon(e.status)} ${e.status}`)],
    ['Uptime', ...envStatuses.map((e) => formatUptime(e.uptime))],
    ['RPS', ...envStatuses.map((e) => String(e.metrics.requestsPerSecond))],
    ['Error Rate', ...envStatuses.map((e) => `${(e.metrics.errorRate * 100).toFixed(2)}%`)],
    ['Avg Response', ...envStatuses.map((e) => `${e.metrics.avgResponseTime}ms`)],
    ['P95 Response', ...envStatuses.map((e) => `${e.metrics.p95ResponseTime}ms`)],
    ['Connections', ...envStatuses.map((e) => String(e.metrics.activeConnections))],
    ['CPU', ...envStatuses.map((e) => `${e.metrics.cpuUsage}%`)],
    ['Memory', ...envStatuses.map((e) => `${e.metrics.memoryUsage}%`)],
    ['Disk', ...envStatuses.map((e) => `${e.metrics.diskUsage}%`)],
  ];

  return (
    <Card>
      <h3 className="text-lg font-semibold text-white mb-4">🔍 Environment Comparison</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th
                  key={i}
                  className={`text-left py-2 px-3 text-slate-400 font-medium border-b border-slate-700 ${
                    i === 0 ? '' : 'text-center'
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className="hover:bg-slate-700/50">
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className={`py-2 px-3 border-b border-slate-800 ${
                      ci === 0
                        ? 'text-slate-300 font-medium'
                        : 'text-center text-white font-mono text-xs'
                    }`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

// ─── Main Component ──────────────────────────────────────────────────────────

const Deployments: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [envStatuses, setEnvStatuses] = useState<EnvironmentStatus[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [releases, setReleases] = useState<Release[]>([]);
  const [stats, setStats] = useState<DeploymentStats | null>(null);
  const [selectedDeployment, setSelectedDeployment] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const toast = useToast();

  const fetchData = useCallback(async () => {
    try {
      setError(null);

      const [envRes, depRes, relRes, statsRes] = await Promise.all([
        API.get<EnvironmentStatus[]>('/deployments/environments').catch(
          (): EnvironmentStatus[] => [],
        ),
        API.get<{ deployments: Deployment[] }>('/deployments?limit=20').catch(() => ({
          deployments: [] as Deployment[],
        })),
        API.get<{ releases: Release[] }>('/deployments/releases').catch(() => ({
          releases: [] as Release[],
        })),
        API.get<DeploymentStats>('/deployments/stats').catch((): null => null),
      ]);

      if (Array.isArray(envRes)) setEnvStatuses(envRes);
      if (depRes && 'deployments' in depRes) setDeployments(depRes.deployments);
      if (relRes && 'releases' in relRes) setReleases(relRes.releases);
      if (statsRes) setStats(statsRes);
    } catch (err) {
      setError('Failed to fetch deployment data');
      toast.error('Failed to fetch deployment data');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

  const handleRollback = async (deploymentId: string, environment: Environment) => {
    if (!window.confirm(`Are you sure you want to rollback ${environment}?`)) return;
    try {
      await API.post(`/deployments/${deploymentId}/rollback`, { environment });
      await fetchData();
    } catch (err) {
      toast.error('Rollback failed');
      setError('Rollback failed');
    }
  };

  const tabs: { id: TabId; label: string; icon: string }[] = [
    { id: 'overview', label: 'Overview', icon: '🏠' },
    { id: 'deployments', label: 'Deployments', icon: '🚀' },
    { id: 'releases', label: 'Releases', icon: '📦' },
    { id: 'compare', label: 'Compare', icon: '🔍' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-slate-400 text-lg">Loading deployment data...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">🚀 Deployment Dashboard</h1>
          <p className="text-sm text-slate-400 mt-1">
            Monitor environments, track deployments, manage releases
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-slate-600 bg-slate-700"
            />
            Auto-refresh
          </label>
          <button
            onClick={fetchData}
            className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Tab navigation */}
      <div className="flex gap-1 mb-6 bg-slate-800 rounded-lg p-1 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm rounded-md transition-colors ${
              activeTab === tab.id
                ? 'bg-cyan-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && <EnvironmentOverview envStatuses={envStatuses} stats={stats} />}

      {activeTab === 'deployments' && (
        <DeploymentList
          deployments={deployments}
          selectedId={selectedDeployment}
          onSelect={(id) => setSelectedDeployment(selectedDeployment === id ? null : id)}
          onRollback={handleRollback}
        />
      )}

      {activeTab === 'releases' && <ReleaseHistory releases={releases} />}

      {activeTab === 'compare' && <EnvironmentCompare envStatuses={envStatuses} />}
    </div>
  );
};

export default Deployments;
