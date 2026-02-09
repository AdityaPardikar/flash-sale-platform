import React, { useState, useEffect } from 'react';
import { API } from '../../services/api';

/**
 * Audit log entry
 */
interface AuditLogEntry {
  id: string;
  userId: string;
  action: string;
  entityType: string;
  entityId?: string;
  ipAddress?: string;
  userAgent?: string;
  changes?: Record<string, any>;
  createdAt: string;
}

/**
 * Filters for audit logs
 */
interface AuditFilters {
  action?: string;
  entityType?: string;
  userId?: string;
  startDate?: string;
  endDate?: string;
}

/**
 * Props for AuditLogTable
 */
interface AuditLogTableProps {
  logs: AuditLogEntry[];
  loading: boolean;
  onViewDetails: (log: AuditLogEntry) => void;
}

/**
 * Audit Log Table Component
 */
const AuditLogTable: React.FC<AuditLogTableProps> = ({ logs, loading, onViewDetails }) => {
  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No audit logs found
      </div>
    );
  }

  const getActionColor = (action: string): string => {
    if (action.includes('CREATED') || action.includes('LOGIN')) return 'text-green-600 bg-green-100';
    if (action.includes('DELETED') || action.includes('FAILED')) return 'text-red-600 bg-red-100';
    if (action.includes('UPDATED') || action.includes('CHANGED')) return 'text-yellow-600 bg-yellow-100';
    return 'text-blue-600 bg-blue-100';
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Timestamp
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Action
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Entity
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              User
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              IP Address
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {logs.map((log) => (
            <tr key={log.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 text-sm text-gray-600">
                {formatDate(log.createdAt)}
              </td>
              <td className="px-4 py-3">
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${getActionColor(log.action)}`}>
                  {log.action}
                </span>
              </td>
              <td className="px-4 py-3 text-sm">
                <span className="text-gray-900">{log.entityType}</span>
                {log.entityId && (
                  <span className="text-gray-500 text-xs ml-1">
                    ({log.entityId.substring(0, 8)}...)
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-sm text-gray-600">
                {log.userId.substring(0, 8)}...
              </td>
              <td className="px-4 py-3 text-sm text-gray-500">
                {log.ipAddress || '-'}
              </td>
              <td className="px-4 py-3">
                <button
                  onClick={() => onViewDetails(log)}
                  className="text-blue-600 hover:text-blue-800 text-sm"
                >
                  View Details
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/**
 * Audit Log Details Modal
 */
interface AuditLogDetailsProps {
  log: AuditLogEntry | null;
  onClose: () => void;
}

const AuditLogDetails: React.FC<AuditLogDetailsProps> = ({ log, onClose }) => {
  if (!log) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-900">Audit Log Details</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        
        <div className="px-6 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-500">Action</label>
              <p className="text-gray-900">{log.action}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500">Timestamp</label>
              <p className="text-gray-900">{new Date(log.createdAt).toLocaleString()}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500">Entity Type</label>
              <p className="text-gray-900">{log.entityType}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500">Entity ID</label>
              <p className="text-gray-900 font-mono text-sm">{log.entityId || '-'}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500">User ID</label>
              <p className="text-gray-900 font-mono text-sm">{log.userId}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500">IP Address</label>
              <p className="text-gray-900">{log.ipAddress || '-'}</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-500">User Agent</label>
            <p className="text-gray-900 text-sm break-all">{log.userAgent || '-'}</p>
          </div>

          {log.changes && Object.keys(log.changes).length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-2">Changes</label>
              <pre className="bg-gray-100 p-4 rounded-lg text-sm overflow-x-auto">
                {JSON.stringify(log.changes, null, 2)}
              </pre>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Audit Logs Page
 */
const AuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 0,
  });

  const [filters, setFilters] = useState<AuditFilters>({});
  const [showFilters, setShowFilters] = useState(false);

  const actionTypes = [
    'USER_LOGIN',
    'USER_LOGOUT',
    'USER_CREATED',
    'USER_UPDATED',
    'USER_DELETED',
    'SALE_CREATED',
    'SALE_STARTED',
    'SALE_ENDED',
    'ORDER_CREATED',
    'ORDER_COMPLETED',
    'SETTINGS_CHANGED',
    'DATA_EXPORT',
  ];

  const entityTypes = [
    'user',
    'flash_sale',
    'order',
    'product',
    'queue',
    'consent',
    'settings',
  ];

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      });

      if (filters.action) params.append('action', filters.action);
      if (filters.entityType) params.append('entityType', filters.entityType);
      if (filters.userId) params.append('userId', filters.userId);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);

      const response = await API.get(`/api/admin/audit-logs?${params.toString()}`);
      setLogs(response.data.logs);
      setPagination(prev => ({
        ...prev,
        total: response.data.total,
        totalPages: response.data.totalPages,
      }));
    } catch (error) {
      console.error('Error fetching audit logs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [pagination.page, pagination.limit, filters]);

  const handleFilterChange = (key: keyof AuditFilters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value || undefined }));
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const clearFilters = () => {
    setFilters({});
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handleExport = async () => {
    try {
      const token = localStorage.getItem('token') || '';
      const response = await fetch('/api/admin/audit-logs/export', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        throw new Error('Export failed');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `audit-logs-${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting audit logs:', error);
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Audit Logs</h1>
          <p className="text-gray-600 mt-1">View system activity and security events</p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            Filters
          </button>
          <button
            onClick={handleExport}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export CSV
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Action</label>
              <select
                value={filters.action || ''}
                onChange={(e) => handleFilterChange('action', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              >
                <option value="">All Actions</option>
                {actionTypes.map(action => (
                  <option key={action} value={action}>{action}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Entity Type</label>
              <select
                value={filters.entityType || ''}
                onChange={(e) => handleFilterChange('entityType', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              >
                <option value="">All Types</option>
                {entityTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">User ID</label>
              <input
                type="text"
                value={filters.userId || ''}
                onChange={(e) => handleFilterChange('userId', e.target.value)}
                placeholder="Enter user ID"
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input
                type="date"
                value={filters.startDate || ''}
                onChange={(e) => handleFilterChange('startDate', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <input
                type="date"
                value={filters.endDate || ''}
                onChange={(e) => handleFilterChange('endDate', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={clearFilters}
              className="px-4 py-2 text-gray-600 hover:text-gray-800"
            >
              Clear Filters
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow">
        <AuditLogTable
          logs={logs}
          loading={loading}
          onViewDetails={setSelectedLog}
        />

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-500">
              Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
              {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
              {pagination.total} logs
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                disabled={pagination.page === 1}
                className="px-3 py-1 border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Previous
              </button>
              <span className="px-3 py-1 text-gray-600">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                disabled={pagination.page === pagination.totalPages}
                className="px-3 py-1 border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Details Modal */}
      <AuditLogDetails log={selectedLog} onClose={() => setSelectedLog(null)} />
    </div>
  );
};

export default AuditLogs;
