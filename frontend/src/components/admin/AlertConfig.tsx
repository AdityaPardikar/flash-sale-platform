/**
 * Alert Configuration Component
 * Day 5: Monitoring, Logging & Alerting
 * UI for configuring alert thresholds and notifications
 */

import React, { useState } from 'react';

export interface AlertConfigData {
  id: number;
  type: string;
  enabled: boolean;
  threshold?: number;
  thresholdUnit?: string;
  checkInterval: number;
  cooldownPeriod: number;
  severity: 'info' | 'warning' | 'critical';
  notifyEmail: boolean;
  notifySlack: boolean;
  emailRecipients?: string[];
  slackWebhook?: string;
}

interface AlertConfigProps {
  config: AlertConfigData;
  onUpdate: (type: string, updates: Partial<AlertConfigData>) => Promise<void>;
}

const severityColors: Record<string, { bg: string; text: string }> = {
  info: { bg: 'bg-blue-100', text: 'text-blue-800' },
  warning: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  critical: { bg: 'bg-red-100', text: 'text-red-800' },
};

export const AlertConfigItem: React.FC<AlertConfigProps> = ({ config, onUpdate }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValues, setEditValues] = useState<Partial<AlertConfigData>>({});
  const [saving, setSaving] = useState(false);

  const handleToggle = async () => {
    setSaving(true);
    try {
      await onUpdate(config.type, { enabled: !config.enabled });
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdate(config.type, editValues);
      setIsEditing(false);
      setEditValues({});
    } finally {
      setSaving(false);
    }
  };

  const formatType = (type: string): string => {
    return type
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const severityStyle = severityColors[config.severity] || severityColors.info;

  return (
    <div className={`border rounded-lg p-4 ${config.enabled ? 'bg-white' : 'bg-gray-50'}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={handleToggle}
              disabled={saving}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
          </label>
          <h3 className="font-semibold text-gray-900">{formatType(config.type)}</h3>
        </div>
        
        <span className={`px-2 py-1 text-xs font-medium rounded ${severityStyle.bg} ${severityStyle.text}`}>
          {config.severity}
        </span>
      </div>

      {!isEditing ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          {config.threshold !== undefined && (
            <div>
              <span className="text-gray-500">Threshold:</span>
              <span className="ml-1 font-medium">
                {config.threshold} {config.thresholdUnit}
              </span>
            </div>
          )}
          <div>
            <span className="text-gray-500">Check Interval:</span>
            <span className="ml-1 font-medium">{config.checkInterval}s</span>
          </div>
          <div>
            <span className="text-gray-500">Cooldown:</span>
            <span className="ml-1 font-medium">{config.cooldownPeriod}s</span>
          </div>
          <div className="flex items-center gap-2">
            {config.notifyEmail && (
              <span className="px-2 py-0.5 bg-gray-100 rounded text-xs">Email</span>
            )}
            {config.notifySlack && (
              <span className="px-2 py-0.5 bg-gray-100 rounded text-xs">Slack</span>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {config.threshold !== undefined && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Threshold ({config.thresholdUnit})
                </label>
                <input
                  type="number"
                  value={editValues.threshold ?? config.threshold}
                  onChange={(e) =>
                    setEditValues({ ...editValues, threshold: parseFloat(e.target.value) })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            )}
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Check Interval (seconds)
              </label>
              <input
                type="number"
                value={editValues.checkInterval ?? config.checkInterval}
                onChange={(e) =>
                  setEditValues({ ...editValues, checkInterval: parseInt(e.target.value) })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cooldown (seconds)
              </label>
              <input
                type="number"
                value={editValues.cooldownPeriod ?? config.cooldownPeriod}
                onChange={(e) =>
                  setEditValues({ ...editValues, cooldownPeriod: parseInt(e.target.value) })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={editValues.notifyEmail ?? config.notifyEmail}
                onChange={(e) =>
                  setEditValues({ ...editValues, notifyEmail: e.target.checked })
                }
                className="rounded border-gray-300"
              />
              <span className="text-sm">Email notifications</span>
            </label>
            
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={editValues.notifySlack ?? config.notifySlack}
                onChange={(e) =>
                  setEditValues({ ...editValues, notifySlack: e.target.checked })
                }
                className="rounded border-gray-300"
              />
              <span className="text-sm">Slack notifications</span>
            </label>
          </div>
        </div>
      )}

      <div className="mt-3 flex justify-end gap-2">
        {isEditing ? (
          <>
            <button
              onClick={() => {
                setIsEditing(false);
                setEditValues({});
              }}
              className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </>
        ) : (
          <button
            onClick={() => setIsEditing(true)}
            className="px-3 py-1 text-sm text-blue-600 hover:text-blue-800"
          >
            Edit
          </button>
        )}
      </div>
    </div>
  );
};

interface AlertConfigListProps {
  configs: AlertConfigData[];
  onUpdate: (type: string, updates: Partial<AlertConfigData>) => Promise<void>;
}

export const AlertConfigList: React.FC<AlertConfigListProps> = ({ configs, onUpdate }) => {
  return (
    <div className="space-y-4">
      {configs.map((config) => (
        <AlertConfigItem key={config.type} config={config} onUpdate={onUpdate} />
      ))}
    </div>
  );
};

export default AlertConfigList;
