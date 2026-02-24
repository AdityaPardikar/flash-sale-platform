/**
 * Graceful Shutdown Manager
 * Week 6 Day 6: Production Hardening & Resilience
 *
 * Manages graceful application shutdown:
 * - Signal handling (SIGTERM, SIGINT)
 * - In-flight request completion
 * - Connection draining
 * - Resource cleanup ordering
 * - Timeout-based force shutdown
 */

import { Server } from 'http';

// ─── Types ────────────────────────────────────────────────────

type CleanupFn = () => Promise<void> | void;

interface ShutdownHook {
  name: string;
  priority: number; // Lower = runs first
  cleanup: CleanupFn;
  timeoutMs: number;
}

interface ShutdownConfig {
  /** Maximum time for graceful shutdown before force exit (ms) */
  gracefulTimeoutMs: number;
  /** Whether to log shutdown progress */
  verbose: boolean;
  /** Exit code on graceful shutdown */
  exitCode: number;
}

// ─── Graceful Shutdown Manager ────────────────────────────────

class GracefulShutdown {
  private hooks: ShutdownHook[] = [];
  private isShuttingDown: boolean = false;
  private server: Server | null = null;
  private activeConnections: Set<any> = new Set();
  private config: ShutdownConfig;

  constructor(config: Partial<ShutdownConfig> = {}) {
    this.config = {
      gracefulTimeoutMs: 30000,
      verbose: true,
      exitCode: 0,
      ...config,
    };
  }

  /**
   * Register the HTTP server for connection tracking
   */
  registerServer(server: Server): void {
    this.server = server;

    // Track active connections
    server.on('connection', (socket) => {
      this.activeConnections.add(socket);
      socket.on('close', () => {
        this.activeConnections.delete(socket);
      });
    });

    this.log(`Server registered for graceful shutdown (${this.activeConnections.size} active connections)`);
  }

  /**
   * Register a cleanup hook
   */
  registerHook(name: string, cleanup: CleanupFn, priority: number = 50, timeoutMs: number = 5000): void {
    this.hooks.push({ name, cleanup, priority, timeoutMs });
    this.hooks.sort((a, b) => a.priority - b.priority);
    this.log(`Registered shutdown hook: ${name} (priority: ${priority})`);
  }

  /**
   * Install signal handlers
   */
  installSignalHandlers(): void {
    const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT', 'SIGUSR2'];

    for (const signal of signals) {
      process.on(signal, async () => {
        this.log(`Received ${signal} — initiating graceful shutdown`);
        await this.shutdown(signal);
      });
    }

    // Handle uncaught exceptions
    process.on('uncaughtException', async (error) => {
      console.error('[GracefulShutdown] Uncaught exception:', error);
      await this.shutdown('uncaughtException');
    });

    // Handle unhandled rejections
    process.on('unhandledRejection', async (reason) => {
      console.error('[GracefulShutdown] Unhandled rejection:', reason);
      await this.shutdown('unhandledRejection');
    });

    this.log('Signal handlers installed (SIGTERM, SIGINT, SIGUSR2)');
  }

  /**
   * Execute graceful shutdown
   */
  async shutdown(reason: string = 'manual'): Promise<void> {
    if (this.isShuttingDown) {
      this.log('Shutdown already in progress, ignoring duplicate signal');
      return;
    }
    this.isShuttingDown = true;

    this.log(`\n${'═'.repeat(50)}`);
    this.log(`GRACEFUL SHUTDOWN INITIATED — reason: ${reason}`);
    this.log(`${'═'.repeat(50)}`);

    // Set force shutdown timer
    const forceTimer = setTimeout(() => {
      console.error(`[GracefulShutdown] Force shutdown after ${this.config.gracefulTimeoutMs}ms timeout`);
      process.exit(1);
    }, this.config.gracefulTimeoutMs);

    try {
      // Phase 1: Stop accepting new connections
      await this.stopAcceptingConnections();

      // Phase 2: Wait for in-flight requests to complete
      await this.drainConnections();

      // Phase 3: Run cleanup hooks in priority order
      await this.runCleanupHooks();

      this.log('Graceful shutdown complete');
      clearTimeout(forceTimer);
      process.exit(this.config.exitCode);
    } catch (error) {
      console.error('[GracefulShutdown] Error during shutdown:', error);
      clearTimeout(forceTimer);
      process.exit(1);
    }
  }

  /**
   * Stop accepting new connections
   */
  private async stopAcceptingConnections(): Promise<void> {
    if (!this.server) return;

    return new Promise<void>((resolve, reject) => {
      this.log('Phase 1: Stopping new connections...');
      this.server!.close((err) => {
        if (err) {
          this.log(`Warning: Server close error: ${err.message}`);
          reject(err);
        } else {
          this.log('Phase 1: Server stopped accepting connections');
          resolve();
        }
      });
    });
  }

  /**
   * Drain active connections
   */
  private async drainConnections(): Promise<void> {
    this.log(`Phase 2: Draining ${this.activeConnections.size} active connections...`);

    if (this.activeConnections.size === 0) {
      this.log('Phase 2: No active connections to drain');
      return;
    }

    // Set keep-alive to false and destroy idle connections
    for (const socket of this.activeConnections) {
      if (socket.destroyed) {
        this.activeConnections.delete(socket);
        continue;
      }
      // Signal the socket to close after current response
      socket.setKeepAlive(false);
    }

    // Wait for connections to drain (with timeout)
    const drainTimeout = Math.min(10000, this.config.gracefulTimeoutMs / 3);
    await new Promise<void>((resolve) => {
      const checkInterval = setInterval(() => {
        if (this.activeConnections.size === 0) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);

      setTimeout(() => {
        clearInterval(checkInterval);
        // Force-close remaining connections
        const remaining = this.activeConnections.size;
        if (remaining > 0) {
          this.log(`Phase 2: Force-closing ${remaining} remaining connections`);
          for (const socket of this.activeConnections) {
            socket.destroy();
          }
          this.activeConnections.clear();
        }
        resolve();
      }, drainTimeout);
    });

    this.log('Phase 2: Connection draining complete');
  }

  /**
   * Run registered cleanup hooks
   */
  private async runCleanupHooks(): Promise<void> {
    this.log(`Phase 3: Running ${this.hooks.length} cleanup hooks...`);

    for (const hook of this.hooks) {
      this.log(`  Running: ${hook.name}...`);
      try {
        await Promise.race([
          Promise.resolve(hook.cleanup()),
          new Promise<void>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), hook.timeoutMs)
          ),
        ]);
        this.log(`  ✓ ${hook.name} completed`);
      } catch (error: any) {
        this.log(`  ✗ ${hook.name} failed: ${error.message}`);
      }
    }

    this.log('Phase 3: Cleanup hooks complete');
  }

  /**
   * Check if shutdown is in progress
   */
  isInProgress(): boolean {
    return this.isShuttingDown;
  }

  /**
   * Get the number of active connections
   */
  getActiveConnectionCount(): number {
    return this.activeConnections.size;
  }

  private log(message: string): void {
    if (this.config.verbose) {
      console.log(`[GracefulShutdown] ${message}`);
    }
  }
}

export const gracefulShutdown = new GracefulShutdown();
export { GracefulShutdown };
