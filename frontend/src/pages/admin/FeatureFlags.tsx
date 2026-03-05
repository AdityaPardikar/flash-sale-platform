/**
 * Feature Flags Admin Page
 * Week 6 Day 6: Production Hardening & Resilience
 *
 * Admin interface for managing feature flags:
 * - View all flags with type and status
 * - Toggle flags on/off
 * - Adjust rollout percentages
 * - Visual indicators for flag types
 */

import React, { useState, useEffect, useCallback } from 'react';
import { API } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';

// ─── Types ────────────────────────────────────────────────────

interface FeatureFlag {
  name: string;
  type: 'boolean' | 'percentage' | 'segment' | 'ab_test';
  enabled: boolean;
  description: string;
  percentage?: number;
  segments?: string[];
  variants?: Record<string, number>;
}

// ─── Default Flags (mirrors backend) ─────────────────────────

const DEFAULT_FLAGS: FeatureFlag[] = [
  {
    name: 'flash_sale_v2',
    type: 'boolean',
    enabled: true,
    description: 'Enable v2 flash sale engine with advanced queue management',
  },
  {
    name: 'new_checkout_flow',
    type: 'percentage',
    enabled: true,
    percentage: 25,
    description: 'New streamlined checkout experience (gradual rollout)',
  },
  {
    name: 'vip_early_access',
    type: 'segment',
    enabled: true,
    segments: ['vip', 'loyal'],
    description: 'Allow VIP and loyal customers early sale access',
  },
  {
    name: 'pricing_algorithm',
    type: 'ab_test',
    enabled: true,
    variants: { control: 50, dynamic: 30, surge: 20 },
    description: 'A/B test pricing algorithm variants',
  },
  {
    name: 'websocket_notifications',
    type: 'boolean',
    enabled: true,
    description: 'Real-time WebSocket push notifications',
  },
  {
    name: 'redis_cache_v2',
    type: 'percentage',
    enabled: true,
    percentage: 100,
    description: 'Use v2 Redis caching strategy with pipeline optimization',
  },
  {
    name: 'analytics_dashboard_v2',
    type: 'segment',
    enabled: true,
    segments: ['admin'],
    description: 'Advanced analytics dashboard for admin users',
  },
  {
    name: 'rate_limit_strict',
    type: 'boolean',
    enabled: false,
    description: 'Strict rate limiting for high-traffic events',
  },
];

// ─── Helpers ──────────────────────────────────────────────────

const typeColors: Record<string, string> = {
  boolean: 'bg-blue-900/50 text-blue-400',
  percentage: 'bg-purple-900/50 text-purple-400',
  segment: 'bg-green-900/50 text-green-400',
  ab_test: 'bg-orange-900/50 text-orange-400',
};

const typeIcons: Record<string, string> = {
  boolean: '🔘',
  percentage: '📊',
  segment: '👥',
  ab_test: '🧪',
};

// ─── Component ────────────────────────────────────────────────

const FeatureFlags: React.FC = () => {
  const [flags, setFlags] = useState<FeatureFlag[]>(DEFAULT_FLAGS);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  const fetchFlags = useCallback(async () => {
    try {
      const response = await API.get<FeatureFlag[]>('/admin/feature-flags');
      if (Array.isArray(response) && response.length > 0) {
        setFlags(response);
      }
    } catch {
      // Fall back to default flags — API may not be deployed yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFlags();
  }, [fetchFlags]);

  const toggleFlag = async (name: string) => {
    const flag = flags.find((f) => f.name === name);
    if (!flag) return;
    const updated = { ...flag, enabled: !flag.enabled };
    setFlags((prev) => prev.map((f) => (f.name === name ? updated : f)));
    try {
      await API.patch(`/admin/feature-flags/${name}`, { enabled: updated.enabled });
      toast.success(`${name} ${updated.enabled ? 'enabled' : 'disabled'}`);
    } catch {
      // Revert on failure
      setFlags((prev) => prev.map((f) => (f.name === name ? flag : f)));
      toast.error(`Failed to update ${name}`);
    }
  };

  const updatePercentage = async (name: string, percentage: number) => {
    setFlags((prev) => prev.map((f) => (f.name === name ? { ...f, percentage } : f)));
    try {
      await API.patch(`/admin/feature-flags/${name}`, { percentage });
    } catch {
      toast.error(`Failed to update rollout percentage for ${name}`);
    }
  };

  const filteredFlags = flags.filter((f) => {
    const matchesSearch =
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      f.description.toLowerCase().includes(search.toLowerCase());
    const matchesType = filterType === 'all' || f.type === filterType;
    return matchesSearch && matchesType;
  });

  const enabledCount = flags.filter((f) => f.enabled).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-6">
        <div className="max-w-5xl mx-auto">
          <div className="animate-pulse space-y-4">
            <div className="h-10 bg-gray-800 rounded w-48"></div>
            <div className="h-6 bg-gray-800 rounded w-32"></div>
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-gray-800 rounded-xl"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Feature Flags</h1>
            <p className="text-gray-400 text-sm mt-1">
              {enabledCount}/{flags.length} flags enabled
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-xs text-gray-500">Production Hardening • Week 6 Day 6</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <input
            type="text"
            placeholder="Search flags..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm
                       placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <div className="flex space-x-1 bg-gray-800 rounded-lg p-1">
            {['all', 'boolean', 'percentage', 'segment', 'ab_test'].map((type) => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  filterType === type ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                {type === 'ab_test' ? 'A/B Test' : type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Flags List */}
        <div className="space-y-3">
          {filteredFlags.map((flag) => (
            <div
              key={flag.name}
              className={`bg-gray-800 rounded-xl border transition-colors ${
                flag.enabled ? 'border-gray-700' : 'border-gray-800 opacity-75'
              }`}
            >
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-1">
                      <span className="text-lg">{typeIcons[flag.type]}</span>
                      <h3 className="font-mono text-sm font-semibold">{flag.name}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${typeColors[flag.type]}`}>
                        {flag.type === 'ab_test' ? 'A/B Test' : flag.type}
                      </span>
                    </div>
                    <p className="text-gray-400 text-sm ml-9">{flag.description}</p>

                    {/* Type-specific details */}
                    <div className="ml-9 mt-3">
                      {flag.type === 'percentage' && (
                        <div className="flex items-center space-x-3">
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={flag.percentage || 0}
                            onChange={(e) => updatePercentage(flag.name, parseInt(e.target.value))}
                            className="w-48 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer
                                       accent-purple-500"
                            disabled={!flag.enabled}
                          />
                          <span className="text-purple-400 font-mono text-sm w-12">
                            {flag.percentage}%
                          </span>
                          <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-purple-500 rounded-full transition-all"
                              style={{ width: `${flag.percentage}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {flag.type === 'segment' && flag.segments && (
                        <div className="flex items-center space-x-2">
                          <span className="text-xs text-gray-500">Segments:</span>
                          {flag.segments.map((s) => (
                            <span
                              key={s}
                              className="text-xs bg-green-900/30 text-green-400 px-2 py-0.5 rounded-full"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      )}

                      {flag.type === 'ab_test' && flag.variants && (
                        <div className="flex items-center space-x-4">
                          <span className="text-xs text-gray-500">Variants:</span>
                          {Object.entries(flag.variants).map(([variant, weight]) => (
                            <div key={variant} className="flex items-center space-x-1">
                              <span className="text-xs text-orange-400 font-mono">{variant}</span>
                              <span className="text-xs text-gray-500">({weight}%)</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Toggle */}
                  <button
                    onClick={() => toggleFlag(flag.name)}
                    className={`relative w-12 h-6 rounded-full transition-colors ${
                      flag.enabled ? 'bg-green-600' : 'bg-gray-600'
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                        flag.enabled ? 'translate-x-6' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filteredFlags.length === 0 && (
          <div className="text-center py-12 text-gray-500">No flags match your filter criteria</div>
        )}
      </div>
    </div>
  );
};

export default FeatureFlags;
