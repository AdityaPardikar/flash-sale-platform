import { Server, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import pool from '../utils/database';
import { queueService } from './queueService';

interface ConnectedUser {
  userId: string;
  saleId: string;
  socketId: string;
  connectedAt: Date;
}

interface LiveMetrics {
  activeUsers: number;
  totalQueued: number;
  totalPurchased: number;
  currentInventory: number;
  avgQueueWaitTime: number;
  conversationRate: number;
}

export class RealtimeService {
  private io: Server | null = null;
  private connectedUsers: Map<string, ConnectedUser> = new Map();
  private updateInterval: NodeJS.Timeout | null = null;

  /**
   * Initialize WebSocket server
   */
  initializeWebSocket(httpServer: HTTPServer): Server {
    this.io = new Server(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
      transports: ['websocket', 'polling'],
    });

    this.setupEventHandlers();
    this.startBroadcasting();

    return this.io;
  }

  /**
   * Setup WebSocket event handlers
   */
  private setupEventHandlers(): void {
    if (!this.io) return;

    this.io.on('connection', (socket: Socket) => {
      console.log(`Client connected: ${socket.id}`);

      // User joins sale queue - subscribe to updates
      socket.on('join-sale', async (data: { userId: string; saleId: string }) => {
        const { userId, saleId } = data;
        const key = `${userId}:${saleId}`;

        this.connectedUsers.set(key, {
          userId,
          saleId,
          socketId: socket.id,
          connectedAt: new Date(),
        });

        socket.join(`sale:${saleId}`);
        socket.join(`user:${userId}`);

        // Send initial queue position
        const position = await queueService.getQueuePosition(userId, saleId);
        socket.emit('queue-position', position);
      });

      // Get live metrics
      socket.on('request-metrics', async (data: { saleId: string }) => {
        const metrics = await this.getLiveMetrics(data.saleId);
        socket.emit('live-metrics', metrics);
      });

      // Admin: Get detailed queue info
      socket.on('admin-queue-details', async (data: { saleId: string; limit: number }) => {
        // In production, verify admin role here
        const details = await this.getQueueDetails(data.saleId, data.limit);
        socket.emit('queue-details', details);
      });

      // Admin: Remove user from queue
      socket.on('admin-remove-user', async (data: { userId: string; saleId: string }) => {
        await queueService.leaveQueue(data.userId, data.saleId);
        this.io?.to(`user:${data.userId}`).emit('removed-from-queue', {
          reason: 'Admin action',
        });
      });

      // Disconnect handler
      socket.on('disconnect', () => {
        this.connectedUsers.forEach((user, key) => {
          if (user.socketId === socket.id) {
            this.connectedUsers.delete(key);
          }
        });
        console.log(`Client disconnected: ${socket.id}`);
      });
    });
  }

  /**
   * Start broadcasting updates to all connected clients
   */
  private startBroadcasting(): void {
    // Broadcast queue updates every 5 seconds
    this.updateInterval = setInterval(async () => {
      for (const user of this.connectedUsers.values()) {
        try {
          const position = await queueService.getQueuePosition(user.userId, user.saleId);
          this.io?.to(`user:${user.userId}`).emit('queue-update', position);
        } catch (error) {
          console.error('Error broadcasting queue update:', error);
        }
      }
    }, 5000);
  }

  /**
   * Get live metrics for a sale
   */
  async getLiveMetrics(saleId: string): Promise<LiveMetrics> {
    try {
      const queueStats = await queueService.getQueueStats(saleId);
      const result = await pool.query(
        `
        SELECT
          COUNT(CASE WHEN status = 'purchased' THEN 1 END) as total_purchased,
          COUNT(CASE WHEN status = 'reserved' THEN 1 END) as total_reserved
        FROM queue_entries
        WHERE flash_sale_id = $1
      `,
        [saleId]
      );

      const activeUsers = this.connectedUsers.size;

      return {
        activeUsers,
        totalQueued: queueStats.totalWaiting,
        totalPurchased: parseInt(result.rows[0]?.total_purchased || 0),
        currentInventory: queueStats.totalWaiting,
        avgQueueWaitTime: queueStats.estimatedWaitTimeMinutes * 60,
        conversationRate: queueStats.admissionRate,
      };
    } catch (error) {
      console.error('Error getting live metrics:', error);
      return {
        activeUsers: 0,
        totalQueued: 0,
        totalPurchased: 0,
        currentInventory: 0,
        avgQueueWaitTime: 0,
        conversationRate: 0,
      };
    }
  }

  /**
   * Get detailed queue information for admin
   */
  async getQueueDetails(saleId: string, limit: number = 100) {
    try {
      const result = await pool.query(
        `
        SELECT 
          qe.id,
          qe.user_id,
          qe.position,
          qe.status,
          qe.joined_at,
          u.email
        FROM queue_entries qe
        JOIN users u ON qe.user_id = u.id
        WHERE qe.flash_sale_id = $1
        ORDER BY qe.position ASC
        LIMIT $2
      `,
        [saleId, limit]
      );

      return {
        total: result.rowCount,
        entries: result.rows,
        timestamp: new Date(),
      };
    } catch (error) {
      console.error('Error getting queue details:', error);
      return { total: 0, entries: [], timestamp: new Date() };
    }
  }

  /**
   * Emit order update to user
   */
  emitOrderUpdate(userId: string, order: unknown): void {
    this.io?.to(`user:${userId}`).emit('order-update', order);
  }

  /**
   * Broadcast sale status change
   */
  broadcastSaleStatusChange(saleId: string, status: string): void {
    this.io?.to(`sale:${saleId}`).emit('sale-status', { status, timestamp: new Date() });
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.updateInterval) clearInterval(this.updateInterval);
    if (this.io) this.io.close();
  }
}

export const realtimeService = new RealtimeService();
