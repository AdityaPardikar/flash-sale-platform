import React, { useState, useEffect } from 'react';

interface QueueEntry {
  id: string;
  saleId: string;
  saleName: string;
  position: number;
  totalInQueue: number;
  estimatedWaitTime: number;
  joinedAt: Date;
  status: 'waiting' | 'ready' | 'completed' | 'expired';
}

interface QueueStatusProps {
  user: any;
}

const mockQueueEntries: QueueEntry[] = [
  {
    id: '1',
    saleId: 'sale-1',
    saleName: 'iPhone 15 Pro Max',
    position: 127,
    totalInQueue: 2451,
    estimatedWaitTime: 180,
    joinedAt: new Date(Date.now() - 120000),
    status: 'waiting',
  },
  {
    id: '2',
    saleId: 'sale-2',
    saleName: 'MacBook Air M3',
    position: 3,
    totalInQueue: 892,
    estimatedWaitTime: 15,
    joinedAt: new Date(Date.now() - 300000),
    status: 'ready',
  },
];

const QueueCard: React.FC<{ entry: QueueEntry }> = ({ entry }) => {
  const progressPercentage = ((entry.totalInQueue - entry.position) / entry.totalInQueue) * 100;

  const statusColors = {
    waiting: 'from-blue-500 to-cyan-500',
    ready: 'from-green-500 to-emerald-500',
    completed: 'from-gray-500 to-gray-600',
    expired: 'from-red-500 to-orange-500',
  };

  const statusLabels = {
    waiting: '⏳ Waiting',
    ready: '✅ Your Turn!',
    completed: '✓ Completed',
    expired: '⚠️ Expired',
  };

  return (
    <div className={`bg-white/10 backdrop-blur-md rounded-2xl overflow-hidden border ${
      entry.status === 'ready' ? 'border-green-500 shadow-lg shadow-green-500/20' : 'border-white/20'
    } transition-all duration-300`}>
      {/* Header */}
      <div className={`bg-gradient-to-r ${statusColors[entry.status]} p-4`}>
        <div className="flex justify-between items-center">
          <span className="text-white font-bold text-lg">{entry.saleName}</span>
          <span className="bg-white/20 text-white px-3 py-1 rounded-full text-sm font-medium">
            {statusLabels[entry.status]}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {/* Position Display */}
        <div className="text-center mb-6">
          <p className="text-gray-400 text-sm mb-1">Your Position</p>
          <div className="flex items-center justify-center space-x-2">
            <span className="text-5xl font-bold text-white">#{entry.position}</span>
            <span className="text-gray-400">of {entry.totalInQueue.toLocaleString()}</span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-6">
          <div className="flex justify-between text-sm text-gray-400 mb-2">
            <span>Queue Progress</span>
            <span>{Math.round(progressPercentage)}% ahead of you served</span>
          </div>
          <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-500"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-white/5 rounded-xl p-4 text-center">
            <p className="text-gray-400 text-xs mb-1">Est. Wait Time</p>
            <p className="text-xl font-bold text-white">
              {entry.estimatedWaitTime < 60
                ? `${entry.estimatedWaitTime}s`
                : `${Math.floor(entry.estimatedWaitTime / 60)}m ${entry.estimatedWaitTime % 60}s`}
            </p>
          </div>
          <div className="bg-white/5 rounded-xl p-4 text-center">
            <p className="text-gray-400 text-xs mb-1">People Ahead</p>
            <p className="text-xl font-bold text-white">{(entry.position - 1).toLocaleString()}</p>
          </div>
        </div>

        {/* Action Button */}
        {entry.status === 'ready' ? (
          <button className="w-full bg-gradient-to-r from-green-500 to-emerald-500 text-white py-4 rounded-xl font-bold text-lg hover:from-green-600 hover:to-emerald-600 transition-all transform hover:scale-[1.02] animate-pulse">
            🛒 Complete Purchase Now!
          </button>
        ) : entry.status === 'waiting' ? (
          <button className="w-full bg-red-500/20 border border-red-500/50 text-red-400 py-3 rounded-xl font-medium hover:bg-red-500/30 transition-all">
            Leave Queue
          </button>
        ) : null}

        {/* Info Text */}
        {entry.status === 'waiting' && (
          <p className="text-center text-gray-400 text-sm mt-4">
            💡 Stay on this page! You'll be notified when it's your turn.
          </p>
        )}
      </div>
    </div>
  );
};

const QueueStatus: React.FC<QueueStatusProps> = ({ user }) => {
  const [queueEntries, setQueueEntries] = useState<QueueEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simulate loading
    const timer = setTimeout(() => {
      if (user) {
        setQueueEntries(mockQueueEntries);
      }
      setIsLoading(false);
    }, 500);

    return () => clearTimeout(timer);
  }, [user]);

  // Simulate real-time position updates
  useEffect(() => {
    if (queueEntries.length === 0) return;

    const interval = setInterval(() => {
      setQueueEntries((prev) =>
        prev.map((entry) => {
          if (entry.status === 'waiting' && entry.position > 1) {
            const newPosition = Math.max(1, entry.position - Math.floor(Math.random() * 3));
            const newStatus = newPosition <= 5 ? 'ready' : 'waiting';
            return {
              ...entry,
              position: newPosition,
              status: newStatus,
              estimatedWaitTime: Math.max(0, entry.estimatedWaitTime - 5),
            };
          }
          return entry;
        })
      );
    }, 5000);

    return () => clearInterval(interval);
  }, [queueEntries.length]);

  if (!user) {
    return (
      <div className="text-center py-16">
        <div className="text-8xl mb-6">🔒</div>
        <h2 className="text-3xl font-bold text-white mb-4">Login Required</h2>
        <p className="text-gray-300 mb-8 max-w-md mx-auto">
          Please login to view your queue status and manage your spot in line for flash sales.
        </p>
        <button className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:from-purple-700 hover:to-blue-700 transition-all transform hover:scale-105">
          Login to Continue
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="text-center py-16">
        <div className="animate-spin text-6xl mb-4">⏳</div>
        <p className="text-gray-300">Loading your queue status...</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">Your Queue Status</h1>
        <p className="text-gray-300">Track your position in flash sale queues</p>
      </div>

      {/* Real-time indicator */}
      <div className="flex justify-center mb-8">
        <div className="bg-white/10 backdrop-blur-md rounded-full px-6 py-2 flex items-center space-x-2 border border-white/20">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
          </span>
          <span className="text-gray-300 text-sm">Live updates active</span>
        </div>
      </div>

      {queueEntries.length > 0 ? (
        <>
          {/* Stats Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 text-center border border-white/10">
              <div className="text-3xl font-bold text-white">{queueEntries.length}</div>
              <div className="text-gray-400 text-sm">Active Queues</div>
            </div>
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 text-center border border-white/10">
              <div className="text-3xl font-bold text-green-400">
                {queueEntries.filter((e) => e.status === 'ready').length}
              </div>
              <div className="text-gray-400 text-sm">Ready for Purchase</div>
            </div>
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 text-center border border-white/10">
              <div className="text-3xl font-bold text-purple-400">
                {Math.min(...queueEntries.map((e) => e.position))}
              </div>
              <div className="text-gray-400 text-sm">Best Position</div>
            </div>
          </div>

          {/* Queue Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {queueEntries.map((entry) => (
              <QueueCard key={entry.id} entry={entry} />
            ))}
          </div>
        </>
      ) : (
        <div className="text-center py-16">
          <div className="text-8xl mb-6">📭</div>
          <h2 className="text-3xl font-bold text-white mb-4">No Active Queues</h2>
          <p className="text-gray-300 mb-8 max-w-md mx-auto">
            You haven't joined any flash sale queues yet. Browse our live sales and join a queue to get started!
          </p>
          <a
            href="/"
            className="inline-block bg-gradient-to-r from-purple-600 to-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:from-purple-700 hover:to-blue-700 transition-all transform hover:scale-105"
          >
            Browse Flash Sales
          </a>
        </div>
      )}

      {/* Info Section */}
      <div className="mt-12 bg-white/5 rounded-2xl p-6 border border-white/10">
        <h3 className="text-lg font-bold text-white mb-4">💡 How the Queue Works</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="text-3xl mb-2">1️⃣</div>
            <h4 className="font-semibold text-white mb-1">Join the Queue</h4>
            <p className="text-gray-400 text-sm">Click "Buy Now" on any active flash sale to secure your spot</p>
          </div>
          <div className="text-center">
            <div className="text-3xl mb-2">2️⃣</div>
            <h4 className="font-semibold text-white mb-1">Wait Your Turn</h4>
            <p className="text-gray-400 text-sm">Your position updates in real-time as others complete purchases</p>
          </div>
          <div className="text-center">
            <div className="text-3xl mb-2">3️⃣</div>
            <h4 className="font-semibold text-white mb-1">Complete Purchase</h4>
            <p className="text-gray-400 text-sm">When it's your turn, you have 5 minutes to complete checkout</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QueueStatus;
