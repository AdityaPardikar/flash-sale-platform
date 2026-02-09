/**
 * Service Status Component
 * Day 5: Monitoring, Logging & Alerting
 * Displays status of individual services
 */

import React from 'react';

interface ServiceStatusProps {
  services: Service[];
  loading?: boolean;
}

interface Service {
  name: string;
  status: 'ok' | 'degraded' | 'unhealthy';
  latencyMs: number;
  details?: Record<string, any>;
}

const statusColors: Record<string, { bg: string; text: string; border: string }> = {
  ok: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-200' },
  degraded: { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-200' },
  unhealthy: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-200' },
};

const statusIcons: Record<string, string> = {
  ok: '✓',
  degraded: '⚠',
  unhealthy: '✗',
};

export const ServiceStatus: React.FC<ServiceStatusProps> = ({ services, loading }) => {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse bg-gray-200 h-24 rounded-lg"></div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {services.map((service) => {
        const colors = statusColors[service.status] || statusColors.unhealthy;
        const icon = statusIcons[service.status] || '?';

        return (
          <div
            key={service.name}
            className={`${colors.bg} ${colors.border} border rounded-lg p-4 shadow-sm`}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-gray-900">{service.name}</h3>
              <span
                className={`${colors.text} text-xl font-bold`}
                title={service.status}
              >
                {icon}
              </span>
            </div>
            
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Status:</span>
                <span className={`font-medium ${colors.text} capitalize`}>
                  {service.status}
                </span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-gray-600">Latency:</span>
                <span className="font-medium text-gray-900">
                  {service.latencyMs}ms
                </span>
              </div>
              
              {service.details && Object.entries(service.details).map(([key, value]) => (
                <div key={key} className="flex justify-between">
                  <span className="text-gray-600 capitalize">
                    {key.replace(/_/g, ' ')}:
                  </span>
                  <span className="font-medium text-gray-900">
                    {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

interface HealthSummaryProps {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  memory: {
    heapUsed: number;
    heapTotal: number;
    percentUsed: number;
  };
}

export const HealthSummary: React.FC<HealthSummaryProps> = ({ status, uptime, memory }) => {
  const colors = statusColors[status] || statusColors.unhealthy;
  
  const formatUptime = (seconds: number): string => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  return (
    <div className={`${colors.bg} ${colors.border} border rounded-lg p-6 mb-6`}>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4 mb-4 md:mb-0">
          <div className={`text-4xl ${colors.text}`}>
            {statusIcons[status] || '?'}
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900 capitalize">
              System {status}
            </h2>
            <p className="text-gray-600">
              Uptime: {formatUptime(uptime)}
            </p>
          </div>
        </div>
        
        <div className="flex gap-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">
              {memory.heapUsed}MB
            </div>
            <div className="text-sm text-gray-600">Memory Used</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">
              {memory.percentUsed}%
            </div>
            <div className="text-sm text-gray-600">Memory %</div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface MetricsCardProps {
  title: string;
  metrics: { label: string; value: string | number; unit?: string }[];
}

export const MetricsCard: React.FC<MetricsCardProps> = ({ title, metrics }) => {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
      <h3 className="font-semibold text-gray-900 mb-3">{title}</h3>
      <div className="space-y-2">
        {metrics.map((metric, index) => (
          <div key={index} className="flex justify-between items-center">
            <span className="text-gray-600">{metric.label}</span>
            <span className="font-medium text-gray-900">
              {metric.value}{metric.unit ? ` ${metric.unit}` : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ServiceStatus;
