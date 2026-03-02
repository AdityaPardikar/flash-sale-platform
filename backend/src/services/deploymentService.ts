/**
 * Deployment & Release Management Service
 * Week 7 Day 6: Deployment Dashboard & Release Management
 *
 * Tracks deployments, builds, releases, and environment health.
 * Provides rollback capability and deployment metrics aggregation.
 */

import { v4 as uuidv4 } from 'uuid';

// ─── Types ───────────────────────────────────────────────────────────────────

export type Environment = 'development' | 'staging' | 'production';

export type DeploymentStatus =
  | 'pending'
  | 'building'
  | 'deploying'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'rolled_back';

export type BuildStage =
  | 'checkout'
  | 'install'
  | 'lint'
  | 'typecheck'
  | 'test'
  | 'build'
  | 'docker'
  | 'push'
  | 'deploy'
  | 'verify';

export interface BuildStep {
  stage: BuildStage;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  logs?: string[];
}

export interface Deployment {
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
  metadata: DeploymentMetadata;
  rollbackTarget?: string;
}

export interface DeploymentMetadata {
  nodeVersion?: string;
  dockerImage?: string;
  dockerTag?: string;
  buildNumber?: number;
  ciPipeline?: string;
  changelog?: string[];
}

export interface EnvironmentStatus {
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

export interface ServiceHealth {
  name: string;
  status: 'ok' | 'degraded' | 'down';
  latencyMs: number;
  version?: string;
  lastChecked: string;
}

export interface EnvironmentMetrics {
  requestsPerSecond: number;
  errorRate: number;
  avgResponseTime: number;
  p95ResponseTime: number;
  activeConnections: number;
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
}

export interface Release {
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

export interface DeploymentQueryOptions {
  environment?: Environment;
  status?: DeploymentStatus;
  limit?: number;
  offset?: number;
  from?: string;
  to?: string;
}

export interface DeploymentStats {
  totalDeployments: number;
  successRate: number;
  avgDeployTime: number;
  rollbackCount: number;
  deploymentsByEnvironment: Record<Environment, number>;
  deploymentsByStatus: Partial<Record<DeploymentStatus, number>>;
  recentFailures: Deployment[];
}

// ─── Pipeline template ──────────────────────────────────────────────────────

const DEFAULT_PIPELINE: BuildStage[] = [
  'checkout',
  'install',
  'lint',
  'typecheck',
  'test',
  'build',
  'docker',
  'push',
  'deploy',
  'verify',
];

// ─── In-memory store (production would use DB) ───────────────────────────────

class DeploymentService {
  private deployments: Map<string, Deployment> = new Map();
  private releases: Map<string, Release> = new Map();
  private environmentStatuses: Map<Environment, EnvironmentStatus> = new Map();

  constructor() {
    this.seedInitialData();
  }

  // ─── Deployment operations ───────────────────────────────────────────────

  /**
   * Create a new deployment record
   */
  async createDeployment(params: {
    environment: Environment;
    version: string;
    gitCommit: string;
    gitBranch: string;
    gitMessage: string;
    deployedBy: string;
    metadata?: Partial<DeploymentMetadata>;
  }): Promise<Deployment> {
    const id = uuidv4();
    const now = new Date().toISOString();

    const buildSteps: BuildStep[] = DEFAULT_PIPELINE.map((stage) => ({
      stage,
      status: 'pending',
    }));

    const deployment: Deployment = {
      id,
      environment: params.environment,
      version: params.version,
      gitCommit: params.gitCommit,
      gitBranch: params.gitBranch,
      gitMessage: params.gitMessage,
      status: 'pending',
      deployedBy: params.deployedBy,
      startedAt: now,
      buildSteps,
      metadata: {
        nodeVersion: process.version,
        buildNumber: this.deployments.size + 1,
        ...params.metadata,
      },
    };

    this.deployments.set(id, deployment);
    console.log(
      `[DeploymentService] Created deployment ${id} → ${params.environment} v${params.version}`,
    );
    return deployment;
  }

  /**
   * Update a build step status within a deployment
   */
  async updateBuildStep(
    deploymentId: string,
    stage: BuildStage,
    status: BuildStep['status'],
    logs?: string[],
  ): Promise<Deployment | null> {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) return null;

    const step = deployment.buildSteps.find((s) => s.stage === stage);
    if (!step) return null;

    const now = new Date().toISOString();

    if (status === 'running' && !step.startedAt) {
      step.startedAt = now;
      deployment.status = 'building';
    }

    if (status === 'success' || status === 'failed') {
      step.finishedAt = now;
      if (step.startedAt) {
        step.durationMs = new Date(now).getTime() - new Date(step.startedAt).getTime();
      }
    }

    step.status = status;
    if (logs) step.logs = logs;

    // If deploy stage completes, mark the overall deployment
    if (stage === 'deploy' && status === 'running') {
      deployment.status = 'deploying';
    }

    if (stage === 'verify' && status === 'success') {
      deployment.status = 'succeeded';
      deployment.finishedAt = now;
      deployment.durationMs = new Date(now).getTime() - new Date(deployment.startedAt).getTime();
      this.updateEnvironmentAfterDeploy(deployment);
    }

    if (status === 'failed') {
      deployment.status = 'failed';
      deployment.finishedAt = now;
      deployment.durationMs = new Date(now).getTime() - new Date(deployment.startedAt).getTime();
    }

    return deployment;
  }

  /**
   * Get a deployment by ID
   */
  async getDeployment(id: string): Promise<Deployment | null> {
    return this.deployments.get(id) || null;
  }

  /**
   * List deployments with filtering and pagination
   */
  async listDeployments(options: DeploymentQueryOptions = {}): Promise<{
    deployments: Deployment[];
    total: number;
  }> {
    let results = Array.from(this.deployments.values());

    // Filter
    if (options.environment) {
      results = results.filter((d) => d.environment === options.environment);
    }
    if (options.status) {
      results = results.filter((d) => d.status === options.status);
    }
    if (options.from) {
      const fromDate = new Date(options.from).getTime();
      results = results.filter((d) => new Date(d.startedAt).getTime() >= fromDate);
    }
    if (options.to) {
      const toDate = new Date(options.to).getTime();
      results = results.filter((d) => new Date(d.startedAt).getTime() <= toDate);
    }

    // Sort newest first
    results.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

    const total = results.length;
    const offset = options.offset || 0;
    const limit = options.limit || 20;

    return {
      deployments: results.slice(offset, offset + limit),
      total,
    };
  }

  /**
   * Initiate a rollback to a specific deployment version
   */
  async rollback(
    environment: Environment,
    targetDeploymentId: string,
    rolledBackBy: string,
  ): Promise<Deployment | null> {
    const target = this.deployments.get(targetDeploymentId);
    if (!target) return null;

    const rollbackDeployment = await this.createDeployment({
      environment,
      version: target.version,
      gitCommit: target.gitCommit,
      gitBranch: target.gitBranch,
      gitMessage: `Rollback to ${target.version} (${target.gitCommit.slice(0, 7)})`,
      deployedBy: rolledBackBy,
      metadata: {
        ...target.metadata,
        changelog: [`Rolled back from current to v${target.version}`],
      },
    });

    rollbackDeployment.rollbackTarget = targetDeploymentId;

    // Simulate instant rollback success
    const now = new Date().toISOString();
    for (const step of rollbackDeployment.buildSteps) {
      step.status = 'success';
      step.startedAt = now;
      step.finishedAt = now;
      step.durationMs = 0;
    }
    rollbackDeployment.status = 'rolled_back';
    rollbackDeployment.finishedAt = now;
    rollbackDeployment.durationMs =
      new Date(now).getTime() - new Date(rollbackDeployment.startedAt).getTime();

    this.updateEnvironmentAfterDeploy(rollbackDeployment);

    console.log(`[DeploymentService] Rolled back ${environment} → v${target.version}`);

    return rollbackDeployment;
  }

  // ─── Environment health ──────────────────────────────────────────────────

  /**
   * Get the health status of all environments
   */
  async getEnvironmentStatuses(): Promise<EnvironmentStatus[]> {
    return Array.from(this.environmentStatuses.values());
  }

  /**
   * Get the health of a specific environment
   */
  async getEnvironmentStatus(env: Environment): Promise<EnvironmentStatus | null> {
    return this.environmentStatuses.get(env) || null;
  }

  /**
   * Compare two environments side by side
   */
  async compareEnvironments(
    envA: Environment,
    envB: Environment,
  ): Promise<{
    envA: EnvironmentStatus | null;
    envB: EnvironmentStatus | null;
    versionDiff: boolean;
    commitDiff: boolean;
  }> {
    const statusA = this.environmentStatuses.get(envA) || null;
    const statusB = this.environmentStatuses.get(envB) || null;

    return {
      envA: statusA,
      envB: statusB,
      versionDiff: statusA?.currentVersion !== statusB?.currentVersion,
      commitDiff: statusA?.currentCommit !== statusB?.currentCommit,
    };
  }

  // ─── Release management ──────────────────────────────────────────────────

  /**
   * Create a new release record
   */
  async createRelease(params: {
    version: string;
    tag: string;
    title: string;
    description: string;
    changelog: string[];
    createdBy: string;
  }): Promise<Release> {
    const id = uuidv4();
    const release: Release = {
      id,
      version: params.version,
      tag: params.tag,
      title: params.title,
      description: params.description,
      changelog: params.changelog,
      createdAt: new Date().toISOString(),
      createdBy: params.createdBy,
      deployments: [],
    };

    this.releases.set(id, release);
    return release;
  }

  /**
   * List all releases, newest first
   */
  async listReleases(limit = 20, offset = 0): Promise<{ releases: Release[]; total: number }> {
    const all = Array.from(this.releases.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return { releases: all.slice(offset, offset + limit), total: all.length };
  }

  /**
   * Get a release by ID
   */
  async getRelease(id: string): Promise<Release | null> {
    return this.releases.get(id) || null;
  }

  // ─── Build metadata & version info ────────────────────────────────────────

  /**
   * Get current build/version info for the running instance
   */
  getBuildInfo(): {
    version: string;
    commit: string;
    branch: string;
    nodeVersion: string;
    environment: string;
    buildTime: string;
    uptime: number;
  } {
    return {
      version: process.env.APP_VERSION || '1.0.0',
      commit: process.env.GIT_COMMIT || 'unknown',
      branch: process.env.GIT_BRANCH || 'main',
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || 'development',
      buildTime: process.env.BUILD_TIME || new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  // ─── Deployment statistics ────────────────────────────────────────────────

  /**
   * Compute aggregate deployment statistics
   */
  async getDeploymentStats(days = 30): Promise<DeploymentStats> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const all = Array.from(this.deployments.values()).filter(
      (d) => new Date(d.startedAt).getTime() >= cutoff.getTime(),
    );

    const succeeded = all.filter((d) => d.status === 'succeeded' || d.status === 'rolled_back');
    const rollbacks = all.filter((d) => d.rollbackTarget);
    const failed = all.filter((d) => d.status === 'failed');

    const durations = succeeded
      .filter((d) => d.durationMs !== undefined)
      .map((d) => d.durationMs as number);

    const avgDeploy =
      durations.length > 0 ? durations.reduce((s, d) => s + d, 0) / durations.length : 0;

    const byEnv: Record<Environment, number> = {
      development: 0,
      staging: 0,
      production: 0,
    };
    const byStatus: Partial<Record<DeploymentStatus, number>> = {};

    for (const d of all) {
      byEnv[d.environment] = (byEnv[d.environment] || 0) + 1;
      byStatus[d.status] = (byStatus[d.status] || 0) + 1;
    }

    return {
      totalDeployments: all.length,
      successRate: all.length > 0 ? succeeded.length / all.length : 0,
      avgDeployTime: avgDeploy,
      rollbackCount: rollbacks.length,
      deploymentsByEnvironment: byEnv,
      deploymentsByStatus: byStatus,
      recentFailures: failed.slice(0, 5),
    };
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────

  /**
   * Update environment status after a successful deployment
   */
  private updateEnvironmentAfterDeploy(deployment: Deployment): void {
    const existing = this.environmentStatuses.get(deployment.environment);
    if (existing) {
      existing.currentVersion = deployment.version;
      existing.currentCommit = deployment.gitCommit;
      existing.lastDeployedAt = deployment.finishedAt || deployment.startedAt;
      existing.lastDeployedBy = deployment.deployedBy;
      existing.status = 'healthy';
    }
  }

  /**
   * Seed realistic initial data for dashboard demo
   */
  private seedInitialData(): void {
    const now = new Date();

    // Environment statuses
    const envs: {
      env: Environment;
      version: string;
      commit: string;
      hoursAgo: number;
      status: EnvironmentStatus['status'];
    }[] = [
      {
        env: 'development',
        version: '1.8.0-dev',
        commit: 'a1b2c3d',
        hoursAgo: 1,
        status: 'healthy',
      },
      { env: 'staging', version: '1.7.2', commit: 'e4f5g6h', hoursAgo: 6, status: 'healthy' },
      { env: 'production', version: '1.7.1', commit: 'i7j8k9l', hoursAgo: 48, status: 'healthy' },
    ];

    for (const e of envs) {
      const deployedAt = new Date(now.getTime() - e.hoursAgo * 3600000);
      this.environmentStatuses.set(e.env, {
        environment: e.env,
        currentVersion: e.version,
        currentCommit: e.commit,
        status: e.status,
        lastDeployedAt: deployedAt.toISOString(),
        lastDeployedBy: 'ci-pipeline',
        uptime: e.hoursAgo * 3600,
        services: [
          {
            name: 'api',
            status: 'ok',
            latencyMs: 12,
            version: e.version,
            lastChecked: now.toISOString(),
          },
          { name: 'database', status: 'ok', latencyMs: 3, lastChecked: now.toISOString() },
          { name: 'redis', status: 'ok', latencyMs: 1, lastChecked: now.toISOString() },
          { name: 'nginx', status: 'ok', latencyMs: 2, lastChecked: now.toISOString() },
        ],
        metrics: {
          requestsPerSecond: e.env === 'production' ? 340 : e.env === 'staging' ? 45 : 12,
          errorRate: e.env === 'production' ? 0.002 : 0.01,
          avgResponseTime: 42,
          p95ResponseTime: 185,
          activeConnections: e.env === 'production' ? 1200 : 80,
          cpuUsage: e.env === 'production' ? 35 : 12,
          memoryUsage: e.env === 'production' ? 62 : 28,
          diskUsage: e.env === 'production' ? 44 : 18,
        },
      });
    }

    // Seed historical deployments
    const deploymentSeeds = [
      {
        env: 'production' as Environment,
        version: '1.7.1',
        commit: 'i7j8k9l',
        branch: 'main',
        msg: 'feat: Week 7 Day 5 - Load Testing',
        by: 'ci-pipeline',
        hoursAgo: 48,
        status: 'succeeded' as DeploymentStatus,
      },
      {
        env: 'staging' as Environment,
        version: '1.7.2',
        commit: 'e4f5g6h',
        branch: 'develop',
        msg: 'feat: Deployment Dashboard',
        by: 'ci-pipeline',
        hoursAgo: 6,
        status: 'succeeded' as DeploymentStatus,
      },
      {
        env: 'production' as Environment,
        version: '1.7.0',
        commit: 'x1y2z3a',
        branch: 'main',
        msg: 'feat: Week 7 Day 4 - E2E Tests',
        by: 'ci-pipeline',
        hoursAgo: 72,
        status: 'succeeded' as DeploymentStatus,
      },
      {
        env: 'staging' as Environment,
        version: '1.7.1',
        commit: 'b4c5d6e',
        branch: 'develop',
        msg: 'fix: Queue position race condition',
        by: 'ci-pipeline',
        hoursAgo: 50,
        status: 'succeeded' as DeploymentStatus,
      },
      {
        env: 'staging' as Environment,
        version: '1.7.0-rc.3',
        commit: 'f7g8h9i',
        branch: 'develop',
        msg: 'chore: Redis connection pool tuning',
        by: 'developer',
        hoursAgo: 96,
        status: 'failed' as DeploymentStatus,
      },
      {
        env: 'development' as Environment,
        version: '1.8.0-dev',
        commit: 'a1b2c3d',
        branch: 'feature/deployments',
        msg: 'feat: Add deployment service',
        by: 'developer',
        hoursAgo: 1,
        status: 'succeeded' as DeploymentStatus,
      },
    ];

    for (const s of deploymentSeeds) {
      const id = uuidv4();
      const startedAt = new Date(now.getTime() - s.hoursAgo * 3600000);
      const durationMs = s.status === 'failed' ? 45000 : 120000 + Math.floor(Math.random() * 60000);
      const finishedAt = new Date(startedAt.getTime() + durationMs);

      const buildSteps: BuildStep[] = DEFAULT_PIPELINE.map((stage, idx) => {
        const stepDur = Math.floor(durationMs / DEFAULT_PIPELINE.length);
        const stepStart = new Date(startedAt.getTime() + idx * stepDur);
        const stepEnd = new Date(stepStart.getTime() + stepDur);

        if (s.status === 'failed' && stage === 'test') {
          return {
            stage,
            status: 'failed' as const,
            startedAt: stepStart.toISOString(),
            finishedAt: stepEnd.toISOString(),
            durationMs: stepDur,
            logs: ['Error: 2 test suites failed'],
          };
        }
        if (s.status === 'failed' && idx > DEFAULT_PIPELINE.indexOf('test')) {
          return { stage, status: 'skipped' as const };
        }
        return {
          stage,
          status: 'success' as const,
          startedAt: stepStart.toISOString(),
          finishedAt: stepEnd.toISOString(),
          durationMs: stepDur,
        };
      });

      this.deployments.set(id, {
        id,
        environment: s.env,
        version: s.version,
        gitCommit: s.commit,
        gitBranch: s.branch,
        gitMessage: s.msg,
        status: s.status,
        deployedBy: s.by,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs,
        buildSteps,
        metadata: {
          nodeVersion: 'v20.11.0',
          buildNumber: this.deployments.size + 1,
          ciPipeline: 'GitHub Actions',
        },
      });
    }

    // Seed releases
    const releaseSeeds = [
      {
        version: '1.7.1',
        tag: 'v1.7.1',
        title: 'Performance & Load Testing',
        changelog: ['k6 load test scripts', 'API benchmark suite', 'Stress/soak test framework'],
        hoursAgo: 48,
      },
      {
        version: '1.7.0',
        tag: 'v1.7.0',
        title: 'CI/CD & Docker Optimization',
        changelog: [
          'Multi-stage Docker build',
          'GitHub Actions CI/CD',
          'Nginx production config',
          'API contract tests',
          'E2E test suites',
        ],
        hoursAgo: 96,
      },
      {
        version: '1.6.0',
        tag: 'v1.6.0',
        title: 'Production Hardening',
        changelog: [
          'Circuit breaker pattern',
          'Graceful shutdown',
          'Feature flags',
          'Bulkhead isolation',
          'WebSocket infrastructure',
          'i18n (5 languages)',
        ],
        hoursAgo: 168,
      },
    ];

    for (const r of releaseSeeds) {
      const id = uuidv4();
      this.releases.set(id, {
        id,
        version: r.version,
        tag: r.tag,
        title: r.title,
        description: `Release ${r.version} — ${r.title}`,
        changelog: r.changelog,
        createdAt: new Date(now.getTime() - r.hoursAgo * 3600000).toISOString(),
        createdBy: 'release-manager',
        deployments: [
          {
            environment: 'staging',
            deployedAt: new Date(now.getTime() - (r.hoursAgo - 4) * 3600000).toISOString(),
            status: 'succeeded',
          },
          {
            environment: 'production',
            deployedAt: new Date(now.getTime() - r.hoursAgo * 3600000).toISOString(),
            status: 'succeeded',
          },
        ],
      });
    }
  }
}

// ─── Singleton export ────────────────────────────────────────────────────────

export const deploymentService = new DeploymentService();
export default deploymentService;
