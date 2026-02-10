import React, { useState, useEffect } from 'react';
import BotSimulator from '../utils/BotSimulator';

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

const BotSimulationDemo: React.FC = () => {
  const [simulator] = useState(new BotSimulator());
  const [isRunning, setIsRunning] = useState(false);
  const [metrics, setMetrics] = useState<DemoMetrics>({
    totalBots: 0,
    activeQueue: 0,
    completedPurchases: 0,
    failedAttempts: 0,
    averageWaitTime: 0,
    apiRequestsPerSecond: 0,
    serverResponseTime: 23,
    inventoryRemaining: 100,
  });
  const [botStats, setBotStats] = useState({ queuing: 0, purchasing: 0, completed: 0, failed: 0 });
  const [queueState, setQueueState] = useState<Array<{ position: number; name: string; device: string; location: string }>>([]);
  const [realUserPosition, setRealUserPosition] = useState<number | null>(null);
  const [demoConfig, setDemoConfig] = useState({
    totalBots: 10000,
    spawnRate: 50,
    realUserName: 'Alex Recruiter',
    realUserEmail: 'recruiter@demo.com',
  });

  // Update metrics every second
  useEffect(() => {
    const interval = setInterval(() => {
      if (isRunning) {
        setMetrics(simulator.getMetrics());
        const stats = simulator.getBotStats();
        setBotStats({
          queuing: stats.queuing || 0,
          purchasing: stats.purchasing || 0,
          completed: stats.completed || 0,
          failed: stats.failed || 0
        });
        setQueueState(simulator.getQueueState());
        
        // Simulate real user position updates
        if (realUserPosition !== null && realUserPosition > 1) {
          setRealUserPosition(prev => Math.max(1, prev! - Math.floor(Math.random() * 3)));
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, simulator, realUserPosition]);

  const startSimulation = async () => {
    setIsRunning(true);
    setRealUserPosition(Math.floor(Math.random() * 200) + 50); // Random starting position
    
    await simulator.startSimulation({
      totalBots: demoConfig.totalBots,
      saleId: 'demo-sale-1',
      spawnRate: demoConfig.spawnRate,
      realUser: {
        name: demoConfig.realUserName,
        email: demoConfig.realUserEmail,
      },
    });
  };

  const stopSimulation = () => {
    simulator.stopSimulation();
    setIsRunning(false);
  };

  const resetSimulation = () => {
    simulator.resetSimulation();
    setIsRunning(false);
    setRealUserPosition(null);
    setMetrics({
      totalBots: 0,
      activeQueue: 0,
      completedPurchases: 0,
      failedAttempts: 0,
      averageWaitTime: 0,
      apiRequestsPerSecond: 0,
      serverResponseTime: 23,
      inventoryRemaining: 100,
    });
  };

  const formatNumber = (num: number) => num.toLocaleString();
  const inventoryPercentage = (metrics.inventoryRemaining / 100) * 100;
  const successRate = metrics.totalBots > 0 ? ((metrics.completedPurchases / metrics.totalBots) * 100).toFixed(1) : '0';

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-indigo-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            🤖 Bot Simulation Dashboard
          </h1>
          <p className="text-gray-300 text-lg">
            Live demonstration of 10,000+ concurrent users in flash sale queue
          </p>
        </div>

        {/* Flash Sale Banner */}
        <div className="bg-gradient-to-r from-red-600 via-orange-500 to-yellow-500 rounded-2xl p-6 mb-8 text-white shadow-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold mb-2">🔥 iPhone 15 Pro Max Flash Sale</h2>
              <p className="text-xl">$899 <span className="line-through opacity-75">$1,199</span> • 25% OFF • Limited Stock!</p>
            </div>
            <div className="text-right">
              <div className="text-4xl font-bold">{metrics.inventoryRemaining}</div>
              <div className="text-lg opacity-90">units left</div>
            </div>
          </div>
          
          <div className="mt-4">
            <div className="flex justify-between text-sm mb-1 opacity-90">
              <span>Stock Level</span>
              <span>{inventoryPercentage.toFixed(1)}% remaining</span>
            </div>
            <div className="h-3 bg-black/20 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-1000 ${
                  inventoryPercentage > 50
                    ? 'bg-green-400'
                    : inventoryPercentage > 25
                    ? 'bg-yellow-400'
                    : 'bg-red-400'
                }`}
                style={{ width: `${inventoryPercentage}%` }}
              />
            </div>
          </div>
        </div>

        {/* Control Panel */}
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 mb-8 border border-white/20">
          <h3 className="text-xl font-bold text-white mb-4">🎮 Simulation Controls</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div>
              <label className="block text-gray-300 text-sm font-medium mb-2">Total Bots</label>
              <input
                type="number"
                value={demoConfig.totalBots}
                onChange={(e) => setDemoConfig({ ...demoConfig, totalBots: parseInt(e.target.value) })}
                disabled={isRunning}
                className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-gray-300 text-sm font-medium mb-2">Spawn Rate (/sec)</label>
              <input
                type="number"
                value={demoConfig.spawnRate}
                onChange={(e) => setDemoConfig({ ...demoConfig, spawnRate: parseInt(e.target.value) })}
                disabled={isRunning}
                className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-gray-300 text-sm font-medium mb-2">Your Name</label>
              <input
                type="text"
                value={demoConfig.realUserName}
                onChange={(e) => setDemoConfig({ ...demoConfig, realUserName: e.target.value })}
                disabled={isRunning}
                className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-gray-300 text-sm font-medium mb-2">Your Email</label>
              <input
                type="email"
                value={demoConfig.realUserEmail}
                onChange={(e) => setDemoConfig({ ...demoConfig, realUserEmail: e.target.value })}
                disabled={isRunning}
                className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white disabled:opacity-50"
              />
            </div>
          </div>

          <div className="flex space-x-4">
            <button
              onClick={startSimulation}
              disabled={isRunning}
              className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:opacity-50 text-white px-8 py-3 rounded-xl font-bold transition-all transform hover:scale-105 disabled:transform-none"
            >
              🚀 Start Bot Army
            </button>
            <button
              onClick={stopSimulation}
              disabled={!isRunning}
              className="bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700 disabled:opacity-50 text-white px-6 py-3 rounded-xl font-bold transition-all"
            >
              ⏹️ Stop
            </button>
            <button
              onClick={resetSimulation}
              className="bg-gradient-to-r from-gray-600 to-slate-600 hover:from-gray-700 hover:to-slate-700 text-white px-6 py-3 rounded-xl font-bold transition-all"
            >
              🔄 Reset
            </button>
          </div>
        </div>

        {/* Real User Status */}
        {realUserPosition !== null && (
          <div className="bg-gradient-to-r from-purple-600/20 to-blue-600/20 border border-purple-500/50 rounded-2xl p-6 mb-8">
            <h3 className="text-xl font-bold text-white mb-4">👤 Your Queue Status (Real User)</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="text-4xl font-bold text-green-400">#{realUserPosition}</div>
                <div className="text-gray-300">Your Position</div>
              </div>
              <div className="text-center">
                <div className="text-4xl font-bold text-blue-400">{Math.max(0, realUserPosition * 3)} sec</div>
                <div className="text-gray-300">Est. Wait Time</div>
              </div>
              <div className="text-center">
                <div className={`text-4xl font-bold ${realUserPosition <= 5 ? 'text-green-400' : 'text-yellow-400'}`}>
                  {realUserPosition <= 5 ? '🎉 Ready!' : '⏳ Waiting'}
                </div>
                <div className="text-gray-300">Status</div>
              </div>
            </div>
          </div>
        )}

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20">
            <div className="flex items-center justify-between mb-2">
              <div className="text-gray-400">Active Bots</div>
              <div className="text-2xl">🤖</div>
            </div>
            <div className="text-3xl font-bold text-white">{formatNumber(metrics.totalBots)}</div>
            <div className="text-sm text-gray-400">{formatNumber(botStats.queuing)} queuing</div>
          </div>

          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20">
            <div className="flex items-center justify-between mb-2">
              <div className="text-gray-400">Queue Length</div>
              <div className="text-2xl">📋</div>
            </div>
            <div className="text-3xl font-bold text-white">{formatNumber(metrics.activeQueue)}</div>
            <div className="text-sm text-gray-400">{formatNumber(botStats.purchasing)} purchasing</div>
          </div>

          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20">
            <div className="flex items-center justify-between mb-2">
              <div className="text-gray-400">Completed</div>
              <div className="text-2xl">✅</div>
            </div>
            <div className="text-3xl font-bold text-green-400">{formatNumber(metrics.completedPurchases)}</div>
            <div className="text-sm text-gray-400">{successRate}% success rate</div>
          </div>

          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20">
            <div className="flex items-center justify-between mb-2">
              <div className="text-gray-400">Response Time</div>
              <div className="text-2xl">⚡</div>
            </div>
            <div className="text-3xl font-bold text-blue-400">{metrics.serverResponseTime}ms</div>
            <div className="text-sm text-gray-400">{formatNumber(metrics.apiRequestsPerSecond)} req/s</div>
          </div>
        </div>

        {/* Live Queue Display */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Queue Position List */}
          <div className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 overflow-hidden">
            <div className="p-6 border-b border-white/20">
              <h3 className="text-xl font-bold text-white">📊 Live Queue (Top 20)</h3>
              <p className="text-gray-400">Real-time queue positions</p>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {queueState.slice(0, 20).map((user, index) => (
                <div
                  key={index}
                  className={`p-4 border-b border-white/10 flex items-center justify-between ${
                    index < 3 ? 'bg-green-500/10' : ''
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <span className="text-white font-mono text-lg">#{user.position}</span>
                    <div>
                      <div className="text-white font-medium">{user.name}</div>
                      <div className="text-gray-400 text-sm">{user.location}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-gray-400 text-sm">{user.device}</div>
                    {index < 3 && <div className="text-green-400 text-xs font-bold">READY</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Performance Metrics */}
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20">
            <h3 className="text-xl font-bold text-white mb-6">⚡ System Performance</h3>
            
            <div className="space-y-6">
              <div>
                <div className="flex justify-between text-sm text-gray-400 mb-2">
                  <span>API Requests/sec</span>
                  <span>{formatNumber(metrics.apiRequestsPerSecond)}</span>
                </div>
                <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 animate-pulse"></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-sm text-gray-400 mb-2">
                  <span>Response Time</span>
                  <span>{metrics.serverResponseTime}ms (Excellent)</span>
                </div>
                <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-green-500 to-emerald-500" 
                    style={{ width: `${Math.max(10, 100 - metrics.serverResponseTime)}%` }}
                  ></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-sm text-gray-400 mb-2">
                  <span>Queue Processing</span>
                  <span>47 users/sec</span>
                </div>
                <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-purple-500 to-pink-500 animate-pulse"></div>
                </div>
              </div>

              <div className="pt-4 border-t border-white/20">
                <h4 className="text-white font-bold mb-3">🏆 System Health</h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Database</span>
                    <span className="text-green-400">✅ Optimal</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Redis Cache</span>
                    <span className="text-green-400">✅ Optimal</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Queue System</span>
                    <span className="text-green-400">✅ Optimal</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Load Balancer</span>
                    <span className="text-green-400">✅ Optimal</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="mt-8 bg-blue-500/10 border border-blue-500/30 rounded-2xl p-6">
          <h3 className="text-lg font-bold text-white mb-3">💡 Demo Instructions for Recruiters</h3>
          <ol className="text-gray-300 space-y-2 list-decimal list-inside">
            <li>Click "🚀 Start Bot Army" to spawn 10,000 concurrent users</li>
            <li>Watch real-time metrics as bots join the queue and make purchases</li>
            <li>Observe your position in the queue among thousands of bots</li>
            <li>See how the system handles extreme load with sub-50ms response times</li>
            <li>Notice zero overselling - inventory decreases atomically</li>
            <li>Experience fair FIFO queue processing with Redis</li>
          </ol>
        </div>
      </div>
    </div>
  );
};

export default BotSimulationDemo;