/**
 * Flash Sale List Component
 * Displays list of flash sales with bulk actions
 */

import React, { useState, useEffect } from 'react';
import { API } from '../../services/api';

interface FlashSale {
  id: string;
  name: string;
  status: string;
  discount_percentage: number;
  start_time: Date;
  end_time: Date;
  remaining_inventory: number;
  total_inventory: number;
}

interface FlashSaleListProps {
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onViewDetails?: (id: string) => void;
}

export const FlashSaleList: React.FC<FlashSaleListProps> = ({
  onEdit,
  onDelete,
  onDuplicate,
  onViewDetails,
}) => {
  const [sales, setSales] = useState<FlashSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSales, setSelectedSales] = useState<Set<string>>(new Set());
  const [filterStatus, setFilterStatus] = useState('');
  const [bulkAction, setBulkAction] = useState('');

  useEffect(() => {
    fetchSales();
  }, [filterStatus]);

  const fetchSales = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = filterStatus ? `?status=${filterStatus}` : '';
      const response = await API.get(`/admin/sales${params}`);
      setSales(response.data || []);
    } catch (err) {
      setError('Failed to load flash sales');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedSales(new Set(sales.map((s) => s.id)));
    } else {
      setSelectedSales(new Set());
    }
  };

  const handleSelectSale = (saleId: string) => {
    const newSelected = new Set(selectedSales);
    if (newSelected.has(saleId)) {
      newSelected.delete(saleId);
    } else {
      newSelected.add(saleId);
    }
    setSelectedSales(newSelected);
  };

  const handleBulkAction = async () => {
    if (!bulkAction || selectedSales.size === 0) {
      return;
    }

    try {
      const action = bulkAction.split('-')[0];
      await API.patch('/admin/sales/bulk', {
        sale_ids: Array.from(selectedSales),
        action,
      });
      await fetchSales();
      setSelectedSales(new Set());
      setBulkAction('');
    } catch (err) {
      setError('Failed to perform bulk action');
    }
  };

  const handleDuplicate = async (saleId: string) => {
    try {
      await API.post(`/admin/sales/${saleId}/duplicate`);
      await fetchSales();
      if (onDuplicate) onDuplicate(saleId);
    } catch (err) {
      setError('Failed to duplicate sale');
    }
  };

  const handleDelete = async (saleId: string) => {
    if (!confirm('Are you sure you want to delete this sale?')) {
      return;
    }

    try {
      await API.delete(`/admin/sales/${saleId}`);
      await fetchSales();
      if (onDelete) onDelete(saleId);
    } catch (err) {
      setError('Failed to delete sale');
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'paused':
        return 'bg-yellow-100 text-yellow-800';
      case 'scheduled':
        return 'bg-blue-100 text-blue-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-gray-500">Loading flash sales...</div>;
  }

  return (
    <div className="bg-white rounded-lg shadow-md">
      {error && (
        <div className="m-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">{error}</div>
      )}

      {/* Controls */}
      <div className="p-6 border-b space-y-4">
        <div className="flex gap-4 items-center">
          {/* Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">All Status</option>
            <option value="draft">Draft</option>
            <option value="scheduled">Scheduled</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="ended">Ended</option>
            <option value="cancelled">Cancelled</option>
          </select>

          {/* Bulk Actions */}
          {selectedSales.size > 0 && (
            <div className="flex gap-2 ml-auto">
              <select
                value={bulkAction}
                onChange={(e) => setBulkAction(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="">Bulk Action ({selectedSales.size})</option>
                <option value="activate-selected">Activate Selected</option>
                <option value="pause-selected">Pause Selected</option>
                <option value="cancel-selected">Cancel Selected</option>
              </select>
              <button
                onClick={handleBulkAction}
                disabled={!bulkAction}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
              >
                Execute
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left">
                <input
                  type="checkbox"
                  checked={selectedSales.size === sales.length && sales.length > 0}
                  onChange={handleSelectAll}
                  className="w-4 h-4"
                />
              </th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Sale Name</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Status</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Discount</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Inventory</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Start Date</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">End Date</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sales.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                  No flash sales found
                </td>
              </tr>
            ) : (
              sales.map((sale) => (
                <tr key={sale.id} className="border-b hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <input
                      type="checkbox"
                      checked={selectedSales.has(sale.id)}
                      onChange={() => handleSelectSale(sale.id)}
                      className="w-4 h-4"
                    />
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{sale.name}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getStatusBadgeColor(sale.status)}`}
                    >
                      {sale.status.charAt(0).toUpperCase() + sale.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">
                      {sale.discount_percentage}%
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-600">
                      {sale.remaining_inventory}/{sale.total_inventory}
                    </div>
                    <div className="w-20 bg-gray-200 rounded-full h-2 mt-1">
                      <div
                        className="bg-blue-600 h-2 rounded-full"
                        style={{
                          width: `${(sale.remaining_inventory / sale.total_inventory) * 100}%`,
                        }}
                      />
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {new Date(sale.start_time).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {new Date(sale.end_time).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <button
                        onClick={() => onViewDetails?.(sale.id)}
                        className="text-indigo-600 hover:text-indigo-900 text-sm font-medium"
                      >
                        Details
                      </button>
                      <button
                        onClick={() => onEdit?.(sale.id)}
                        className="text-blue-600 hover:text-blue-900 text-sm font-medium"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDuplicate(sale.id)}
                        className="text-green-600 hover:text-green-900 text-sm font-medium"
                      >
                        Duplicate
                      </button>
                      <button
                        onClick={() => handleDelete(sale.id)}
                        className="text-red-600 hover:text-red-900 text-sm font-medium"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default FlashSaleList;
