import React, { useState, useEffect } from 'react';

interface FlashSale {
  id: string;
  name: string;
  description: string;
  originalPrice: number;
  salePrice: number;
  discount: number;
  imageUrl: string;
  totalQuantity: number;
  remainingQuantity: number;
  startTime: Date;
  endTime: Date;
  status: 'upcoming' | 'active' | 'ended' | 'sold_out';
}

interface FlashSaleHubProps {
  user: any;
}

// Mock data for demo - will connect to real API
const mockFlashSales: FlashSale[] = [
  {
    id: '1',
    name: 'iPhone 15 Pro Max',
    description: '256GB, Natural Titanium - Limited Flash Deal!',
    originalPrice: 1199,
    salePrice: 899,
    discount: 25,
    imageUrl: 'https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=400',
    totalQuantity: 100,
    remainingQuantity: 34,
    startTime: new Date(Date.now() - 3600000),
    endTime: new Date(Date.now() + 7200000),
    status: 'active',
  },
  {
    id: '2',
    name: 'MacBook Air M3',
    description: '15-inch, 512GB SSD, Midnight',
    originalPrice: 1499,
    salePrice: 1099,
    discount: 27,
    imageUrl: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=400',
    totalQuantity: 50,
    remainingQuantity: 12,
    startTime: new Date(Date.now() - 1800000),
    endTime: new Date(Date.now() + 5400000),
    status: 'active',
  },
  {
    id: '3',
    name: 'Sony WH-1000XM5',
    description: 'Premium Noise Cancelling Headphones',
    originalPrice: 399,
    salePrice: 249,
    discount: 38,
    imageUrl: 'https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?w=400',
    totalQuantity: 200,
    remainingQuantity: 0,
    startTime: new Date(Date.now() - 7200000),
    endTime: new Date(Date.now() + 3600000),
    status: 'sold_out',
  },
  {
    id: '4',
    name: 'PlayStation 5 Slim',
    description: 'Digital Edition with Extra Controller',
    originalPrice: 499,
    salePrice: 379,
    discount: 24,
    imageUrl: 'https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?w=400',
    totalQuantity: 75,
    remainingQuantity: 75,
    startTime: new Date(Date.now() + 3600000),
    endTime: new Date(Date.now() + 10800000),
    status: 'upcoming',
  },
  {
    id: '5',
    name: 'Samsung 65" OLED TV',
    description: '4K Smart TV with Gaming Hub',
    originalPrice: 2499,
    salePrice: 1699,
    discount: 32,
    imageUrl: 'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=400',
    totalQuantity: 30,
    remainingQuantity: 8,
    startTime: new Date(Date.now() - 1200000),
    endTime: new Date(Date.now() + 4800000),
    status: 'active',
  },
  {
    id: '6',
    name: 'DJI Mini 4 Pro',
    description: 'Drone with 4K Camera & Fly More Combo',
    originalPrice: 1099,
    salePrice: 799,
    discount: 27,
    imageUrl: 'https://images.unsplash.com/photo-1473968512647-3e447244af8f?w=400',
    totalQuantity: 40,
    remainingQuantity: 23,
    startTime: new Date(Date.now() + 7200000),
    endTime: new Date(Date.now() + 14400000),
    status: 'upcoming',
  },
];

const CountdownTimer: React.FC<{ endTime: Date; startTime: Date; status: string }> = ({
  endTime,
  startTime,
  status,
}) => {
  const [timeLeft, setTimeLeft] = useState({ hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    const calculateTime = () => {
      const now = new Date().getTime();
      const targetTime = status === 'upcoming' ? startTime.getTime() : endTime.getTime();
      const difference = targetTime - now;

      if (difference > 0) {
        setTimeLeft({
          hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((difference / (1000 * 60)) % 60),
          seconds: Math.floor((difference / 1000) % 60),
        });
      }
    };

    calculateTime();
    const timer = setInterval(calculateTime, 1000);
    return () => clearInterval(timer);
  }, [endTime, startTime, status]);

  const label = status === 'upcoming' ? 'Starts in' : 'Ends in';

  return (
    <div className="text-center">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <div className="flex justify-center space-x-1">
        <div className="bg-black/50 rounded px-2 py-1">
          <span className="text-white font-mono text-lg">{String(timeLeft.hours).padStart(2, '0')}</span>
        </div>
        <span className="text-white text-lg">:</span>
        <div className="bg-black/50 rounded px-2 py-1">
          <span className="text-white font-mono text-lg">{String(timeLeft.minutes).padStart(2, '0')}</span>
        </div>
        <span className="text-white text-lg">:</span>
        <div className="bg-black/50 rounded px-2 py-1">
          <span className="text-white font-mono text-lg">{String(timeLeft.seconds).padStart(2, '0')}</span>
        </div>
      </div>
    </div>
  );
};

const InventoryBar: React.FC<{ total: number; remaining: number }> = ({ total, remaining }) => {
  const percentage = (remaining / total) * 100;
  const soldPercentage = 100 - percentage;

  return (
    <div className="mt-3">
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span>{remaining} left</span>
        <span>{Math.round(soldPercentage)}% sold</span>
      </div>
      <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-500 ${
            percentage < 20
              ? 'bg-gradient-to-r from-red-500 to-orange-500'
              : percentage < 50
              ? 'bg-gradient-to-r from-yellow-500 to-orange-500'
              : 'bg-gradient-to-r from-green-500 to-emerald-500'
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

const FlashSaleCard: React.FC<{ sale: FlashSale; onJoinQueue: (id: string) => void }> = ({
  sale,
  onJoinQueue,
}) => {
  const statusColors = {
    active: 'bg-green-500',
    upcoming: 'bg-blue-500',
    ended: 'bg-gray-500',
    sold_out: 'bg-red-500',
  };

  const statusLabels = {
    active: '🔥 LIVE NOW',
    upcoming: '⏰ COMING SOON',
    ended: 'ENDED',
    sold_out: '❌ SOLD OUT',
  };

  return (
    <div className="bg-white/10 backdrop-blur-md rounded-2xl overflow-hidden border border-white/20 hover:border-purple-400/50 transition-all duration-300 hover:transform hover:scale-[1.02] group">
      {/* Image */}
      <div className="relative h-48 overflow-hidden">
        <img
          src={sale.imageUrl}
          alt={sale.name}
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        
        {/* Status Badge */}
        <div className={`absolute top-3 left-3 ${statusColors[sale.status]} text-white text-xs font-bold px-3 py-1 rounded-full`}>
          {statusLabels[sale.status]}
        </div>
        
        {/* Discount Badge */}
        <div className="absolute top-3 right-3 bg-gradient-to-r from-pink-500 to-red-500 text-white text-sm font-bold px-3 py-1 rounded-full">
          -{sale.discount}%
        </div>
        
        {/* Timer */}
        {(sale.status === 'active' || sale.status === 'upcoming') && (
          <div className="absolute bottom-3 left-0 right-0">
            <CountdownTimer endTime={sale.endTime} startTime={sale.startTime} status={sale.status} />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-5">
        <h3 className="text-white font-bold text-lg mb-1">{sale.name}</h3>
        <p className="text-gray-400 text-sm mb-4">{sale.description}</p>

        {/* Price */}
        <div className="flex items-center space-x-3 mb-4">
          <span className="text-3xl font-bold text-white">${sale.salePrice}</span>
          <span className="text-lg text-gray-500 line-through">${sale.originalPrice}</span>
          <span className="text-green-400 text-sm font-semibold">Save ${sale.originalPrice - sale.salePrice}</span>
        </div>

        {/* Inventory */}
        {sale.status !== 'ended' && (
          <InventoryBar total={sale.totalQuantity} remaining={sale.remainingQuantity} />
        )}

        {/* Action Button */}
        <button
          onClick={() => onJoinQueue(sale.id)}
          disabled={sale.status === 'sold_out' || sale.status === 'ended'}
          className={`w-full mt-4 py-3 rounded-xl font-bold text-white transition-all duration-300 ${
            sale.status === 'active'
              ? 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 transform hover:scale-[1.02] shadow-lg shadow-purple-500/25'
              : sale.status === 'upcoming'
              ? 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700'
              : 'bg-gray-600 cursor-not-allowed'
          }`}
        >
          {sale.status === 'active'
            ? '⚡ Buy Now'
            : sale.status === 'upcoming'
            ? '🔔 Notify Me'
            : sale.status === 'sold_out'
            ? 'Sold Out'
            : 'Sale Ended'}
        </button>
      </div>
    </div>
  );
};

const FlashSaleHub: React.FC<FlashSaleHubProps> = ({ user }) => {
  const [sales, setSales] = useState<FlashSale[]>(mockFlashSales);
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'upcoming'>('all');
  const [joinedQueue, setJoinedQueue] = useState<string | null>(null);

  const filteredSales = sales.filter((sale) => {
    if (activeFilter === 'all') return true;
    return sale.status === activeFilter;
  });

  const handleJoinQueue = (saleId: string) => {
    if (!user) {
      alert('Please login to join the queue!');
      return;
    }
    setJoinedQueue(saleId);
    // In production, this would call the API
    console.log(`Joining queue for sale: ${saleId}`);
  };

  const activeSalesCount = sales.filter((s) => s.status === 'active').length;
  const upcomingSalesCount = sales.filter((s) => s.status === 'upcoming').length;

  return (
    <div>
      {/* Hero Section */}
      <div className="text-center mb-12">
        <div className="inline-block mb-4">
          <span className="bg-gradient-to-r from-purple-600 to-blue-600 text-white text-sm font-bold px-4 py-2 rounded-full">
            🔥 {activeSalesCount} LIVE SALES NOW
          </span>
        </div>
        <h1 className="text-5xl md:text-6xl font-bold text-white mb-4">
          Lightning <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">Flash Deals</span>
        </h1>
        <p className="text-xl text-gray-300 max-w-2xl mx-auto">
          Exclusive limited-time offers at unbeatable prices. Join the queue fast - once they're gone, they're gone!
        </p>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 text-center border border-white/10">
          <div className="text-3xl font-bold text-white">{activeSalesCount}</div>
          <div className="text-gray-400 text-sm">Live Sales</div>
        </div>
        <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 text-center border border-white/10">
          <div className="text-3xl font-bold text-white">{upcomingSalesCount}</div>
          <div className="text-gray-400 text-sm">Upcoming</div>
        </div>
        <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 text-center border border-white/10">
          <div className="text-3xl font-bold text-green-400">$2,847</div>
          <div className="text-gray-400 text-sm">Total Savings</div>
        </div>
        <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 text-center border border-white/10">
          <div className="text-3xl font-bold text-purple-400">12.5K</div>
          <div className="text-gray-400 text-sm">Active Users</div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex justify-center mb-8">
        <div className="bg-white/10 backdrop-blur-md rounded-xl p-1 inline-flex border border-white/10">
          {(['all', 'active', 'upcoming'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`px-6 py-2 rounded-lg font-medium transition-all duration-200 ${
                activeFilter === filter
                  ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {filter === 'all' ? 'All Deals' : filter === 'active' ? '🔥 Live Now' : '⏰ Coming Soon'}
            </button>
          ))}
        </div>
      </div>

      {/* Sales Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredSales.map((sale) => (
          <FlashSaleCard key={sale.id} sale={sale} onJoinQueue={handleJoinQueue} />
        ))}
      </div>

      {/* Queue Modal */}
      {joinedQueue && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gradient-to-br from-gray-900 to-purple-900 rounded-2xl p-8 max-w-md mx-4 border border-purple-500/30">
            <div className="text-center">
              <div className="text-6xl mb-4">🎉</div>
              <h2 className="text-2xl font-bold text-white mb-2">You're in the Queue!</h2>
              <p className="text-gray-300 mb-6">
                Your position: <span className="text-green-400 font-bold">#127</span>
              </p>
              <div className="bg-white/10 rounded-xl p-4 mb-6">
                <p className="text-gray-400 text-sm">Estimated wait time</p>
                <p className="text-3xl font-bold text-white">~3 minutes</p>
              </div>
              <p className="text-gray-400 text-sm mb-6">
                Stay on this page! You'll be automatically redirected to checkout when it's your turn.
              </p>
              <button
                onClick={() => setJoinedQueue(null)}
                className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white py-3 rounded-xl font-bold hover:from-purple-700 hover:to-blue-700 transition-all"
              >
                Got it!
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FlashSaleHub;
