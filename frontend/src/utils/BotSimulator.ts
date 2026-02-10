/**
 * Bot Simulation Controller
 * Simulates thousands of concurrent users for flash sale demonstrations
 */

interface BotUser {
  id: string;
  name: string;
  email: string;
  joinedAt: Date;
  position: number;
  status: 'queuing' | 'purchasing' | 'completed' | 'failed';
  purchaseTime?: Date;
  location: string;
  device: 'mobile' | 'desktop';
}

interface DemoMetrics {
  totalBots: number;
  activeQueue: number;
  completedPurchases: number;
  failedAttempts: number;
  averageWaitTime: number;
  apiRequestsPerSecond: number;
  serverResponseTime: number;
  inventoryRemaining: number;
}

class BotSimulator {
  private bots: Map<string, BotUser> = new Map();
  private isRunning: boolean = false;
  private metrics: DemoMetrics = {
    totalBots: 0,
    activeQueue: 0,
    completedPurchases: 0,
    failedAttempts: 0,
    averageWaitTime: 0,
    apiRequestsPerSecond: 0,
    serverResponseTime: 23,
    inventoryRemaining: 100,
  };
  
  private readonly API_BASE_URL = 'http://localhost:3000/api/v1';
  private readonly locations = [
    'New York, US', 'London, UK', 'Tokyo, JP', 'Mumbai, IN', 
    'São Paulo, BR', 'Sydney, AU', 'Paris, FR', 'Berlin, DE',
    'Toronto, CA', 'Seoul, KR', 'Singapore, SG', 'Dubai, AE'
  ];

  /**
   * Start bot simulation with specified parameters
   */
  async startSimulation(config: {
    totalBots: number;
    saleId: string;
    spawnRate: number; // bots per second
    realUser?: { name: string; email: string };
  }): Promise<void> {
    this.isRunning = true;
    this.metrics.totalBots = config.totalBots;
    
    console.log(`🤖 Starting bot simulation: ${config.totalBots} bots for sale ${config.saleId}`);
    
    // Add real user first if provided
    if (config.realUser) {
      await this.addRealUser(config.realUser, config.saleId);
    }
    
    // Spawn bots in waves to simulate realistic traffic
    let spawnedBots = 0;
    const spawnInterval = setInterval(async () => {
      if (!this.isRunning || spawnedBots >= config.totalBots) {
        clearInterval(spawnInterval);
        return;
      }
      
      // Spawn batch of bots
      const batchSize = Math.min(config.spawnRate, config.totalBots - spawnedBots);
      for (let i = 0; i < batchSize; i++) {
        await this.spawnBot(config.saleId);
        spawnedBots++;
      }
      
      this.updateMetrics();
    }, 1000);
    
    // Start processing queue
    this.processQueue();
  }

  /**
   * Add a real user to the queue (for recruiter demo)
   */
  private async addRealUser(user: { name: string; email: string }, saleId: string): Promise<void> {
    try {
      const response = await fetch(`${this.API_BASE_URL}/queue/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: `real-${user.email}`,
          flashSaleId: saleId,
          userEmail: user.email,
          userName: user.name,
        }),
      });
      
      const result = await response.json();
      console.log(`✅ Real user ${user.name} joined queue at position:`, result.position);
    } catch (error) {
      console.error('Failed to add real user:', error);
    }
  }

  /**
   * Spawn a single bot user
   */
  private async spawnBot(saleId: string): Promise<void> {
    const botId = `bot-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const bot: BotUser = {
      id: botId,
      name: this.generateBotName(),
      email: `${botId}@demo.com`,
      joinedAt: new Date(),
      position: 0,
      status: 'queuing',
      location: this.locations[Math.floor(Math.random() * this.locations.length)],
      device: Math.random() > 0.6 ? 'mobile' : 'desktop',
    };
    
    this.bots.set(botId, bot);
    
    // Add realistic delay to simulate network latency
    const delay = Math.random() * 100 + 50; // 50-150ms
    setTimeout(async () => {
      await this.joinQueue(bot, saleId);
    }, delay);
  }

  /**
   * Make bot join the queue
   */
  private async joinQueue(bot: BotUser, saleId: string): Promise<void> {
    try {
      const response = await fetch(`${this.API_BASE_URL}/queue/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: bot.id,
          flashSaleId: saleId,
          userEmail: bot.email,
          userName: bot.name,
        }),
      });
      
      if (response.ok) {
        const result = await response.json();
        bot.position = result.position;
        this.metrics.activeQueue++;
      } else {
        bot.status = 'failed';
        this.metrics.failedAttempts++;
      }
    } catch (error) {
      console.error(`Bot ${bot.id} failed to join queue:`, error);
      bot.status = 'failed';
      this.metrics.failedAttempts++;
    }
  }

  /**
   * Process queue and simulate purchases
   */
  private processQueue(): void {
    setInterval(() => {
      if (!this.isRunning) return;
      
      // Simulate queue processing - move bots forward
      const queuingBots = Array.from(this.bots.values()).filter(b => b.status === 'queuing');
      
      // Sort by join time (FIFO)
      queuingBots.sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime());
      
      // Process ready bots (position <= 3)
      queuingBots.forEach((bot, index) => {
        bot.position = Math.max(1, bot.position - Math.floor(Math.random() * 2)); // Random queue movement
        
        if (bot.position <= 3 && this.metrics.inventoryRemaining > 0) {
          this.simulatePurchase(bot);
        }
      });
      
    }, 2000); // Process every 2 seconds
  }

  /**
   * Simulate bot making a purchase
   */
  private async simulatePurchase(bot: BotUser): Promise<void> {
    if (bot.status !== 'queuing') return;
    
    bot.status = 'purchasing';
    
    // Simulate purchase delay (checkout process)
    const purchaseDelay = Math.random() * 3000 + 1000; // 1-4 seconds
    
    setTimeout(async () => {
      try {
        // Simulate purchase attempt
        const success = Math.random() > 0.1; // 90% success rate
        
        if (success && this.metrics.inventoryRemaining > 0) {
          bot.status = 'completed';
          bot.purchaseTime = new Date();
          this.metrics.completedPurchases++;
          this.metrics.inventoryRemaining--;
          this.metrics.activeQueue--;
          
          console.log(`✅ Bot ${bot.name} completed purchase! Inventory: ${this.metrics.inventoryRemaining}`);
        } else {
          bot.status = 'failed';
          this.metrics.failedAttempts++;
          this.metrics.activeQueue--;
        }
      } catch (error) {
        bot.status = 'failed';
        this.metrics.failedAttempts++;
        this.metrics.activeQueue--;
      }
    }, purchaseDelay);
  }

  /**
   * Generate realistic bot names
   */
  private generateBotName(): string {
    const firstNames = [
      'Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Jamie', 'Quinn',
      'Avery', 'Blake', 'Drew', 'Reese', 'Sage', 'River', 'Phoenix', 'Skyler'
    ];
    const lastNames = [
      'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
      'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas'
    ];
    
    const first = firstNames[Math.floor(Math.random() * firstNames.length)];
    const last = lastNames[Math.floor(Math.random() * lastNames.length)];
    const number = Math.floor(Math.random() * 999);
    
    return `${first} ${last}${number}`;
  }

  /**
   * Update simulation metrics
   */
  private updateMetrics(): void {
    const totalBots = this.bots.size;
    const completedBots = Array.from(this.bots.values()).filter(b => b.status === 'completed');
    
    if (completedBots.length > 0) {
      const totalWaitTime = completedBots.reduce((sum, bot) => {
        const waitTime = (bot.purchaseTime!.getTime() - bot.joinedAt.getTime()) / 1000;
        return sum + waitTime;
      }, 0);
      
      this.metrics.averageWaitTime = Math.round(totalWaitTime / completedBots.length);
    }
    
    // Simulate API metrics
    this.metrics.apiRequestsPerSecond = Math.floor(Math.random() * 5000) + 10000;
    this.metrics.serverResponseTime = Math.floor(Math.random() * 20) + 15;
  }

  /**
   * Get current simulation metrics
   */
  getMetrics(): DemoMetrics {
    return { ...this.metrics };
  }

  /**
   * Get bot statistics by status
   */
  getBotStats(): { [status: string]: number } {
    const stats = { queuing: 0, purchasing: 0, completed: 0, failed: 0 };
    
    this.bots.forEach(bot => {
      stats[bot.status]++;
    });
    
    return stats;
  }

  /**
   * Get current queue state
   */
  getQueueState(): Array<{ position: number; name: string; device: string; location: string }> {
    return Array.from(this.bots.values())
      .filter(bot => bot.status === 'queuing')
      .sort((a, b) => a.position - b.position)
      .slice(0, 50) // Top 50 in queue
      .map(bot => ({
        position: bot.position,
        name: bot.name,
        device: bot.device,
        location: bot.location,
      }));
  }

  /**
   * Stop the simulation
   */
  stopSimulation(): void {
    this.isRunning = false;
    console.log('🛑 Bot simulation stopped');
  }

  /**
   * Reset simulation state
   */
  resetSimulation(): void {
    this.stopSimulation();
    this.bots.clear();
    this.metrics = {
      totalBots: 0,
      activeQueue: 0,
      completedPurchases: 0,
      failedAttempts: 0,
      averageWaitTime: 0,
      apiRequestsPerSecond: 0,
      serverResponseTime: 23,
      inventoryRemaining: 100,
    };
  }
}

export default BotSimulator;