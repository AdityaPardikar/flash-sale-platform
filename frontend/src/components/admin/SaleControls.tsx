/**
 * Sale Controls Component
 * Controls for managing sale status, scheduling, and inventory
 */

import React, { useState } from 'react';
import { API } from '../../services/api';

interface SaleControlsProps {
  saleId: string;
  currentStatus: string;
  onStatusChange?: (newStatus: string) => void;
  onError?: (error: string) => void;
}

export const SaleControls: React.FC<SaleControlsProps> = ({
  saleId,
  currentStatus,
  onStatusChange,
  onError,
}) => {
  const [loading, setLoading] = useState(false);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [showInventoryForm, setShowInventoryForm] = useState(false);
  const [showPriceOverrideForm, setShowPriceOverrideForm] = useState(false);
  const [scheduleData, setScheduleData] = useState({
    scheduled_start: new Date().toISOString().split('T')[0],
    scheduled_end: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  });
  const [inventoryData, setInventoryData] = useState({
    adjustment: 0,
    reason: '',
  });
  const [priceOverrideData, setPriceOverrideData] = useState({
    product_id: '',
    override_discount_percentage: 0,
  });

  const handleStatusAction = async (action: string) => {
    if (loading) return;

    try {
      setLoading(true);
      await API.post(`/admin/sales/${saleId}/${action}`);
      onStatusChange?.(
        action === 'activate'
          ? 'active'
          : action === 'pause'
            ? 'paused'
            : action === 'resume'
              ? 'active'
              : 'cancelled'
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to perform action';
      onError?.(message);
    } finally {
      setLoading(false);
    }
  };

  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    try {
      setLoading(true);
      await API.post(`/admin/sales/${saleId}/schedule`, scheduleData);
      setShowScheduleForm(false);
      onStatusChange?.('scheduled');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to schedule sale';
      onError?.(message);
    } finally {
      setLoading(false);
    }
  };

  const handleAdjustInventory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    try {
      setLoading(true);
      await API.post(`/admin/sales/${saleId}/adjust-inventory`, inventoryData);
      setShowInventoryForm(false);
      setInventoryData({ adjustment: 0, reason: '' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to adjust inventory';
      onError?.(message);
    } finally {
      setLoading(false);
    }
  };

  const handlePriceOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    try {
      setLoading(true);
      await API.post(`/admin/sales/${saleId}/price-override`, priceOverrideData);
      setShowPriceOverrideForm(false);
      setPriceOverrideData({ product_id: '', override_discount_percentage: 0 });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to set price override';
      onError?.(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold mb-6">Sale Controls</h3>

      {/* Status Controls */}
      <div className="mb-6">
        <h4 className="font-medium text-gray-900 mb-3">Status Management</h4>
        <div className="grid grid-cols-2 gap-3">
          {currentStatus !== 'active' && (
            <button
              onClick={() => handleStatusAction('activate')}
              disabled={loading || currentStatus === 'active'}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium transition-colors"
            >
              Activate Sale
            </button>
          )}
          {currentStatus === 'active' && (
            <button
              onClick={() => handleStatusAction('pause')}
              disabled={loading}
              className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50 text-sm font-medium transition-colors"
            >
              Pause Sale
            </button>
          )}
          {currentStatus === 'paused' && (
            <button
              onClick={() => handleStatusAction('resume')}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium transition-colors"
            >
              Resume Sale
            </button>
          )}
          <button
            onClick={() => handleStatusAction('emergency-stop')}
            disabled={loading}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm font-medium transition-colors"
          >
            Emergency Stop
          </button>
        </div>
      </div>

      <hr className="my-6" />

      {/* Schedule Control */}
      <div className="mb-6">
        <h4 className="font-medium text-gray-900 mb-3">Schedule Management</h4>
        {!showScheduleForm ? (
          <button
            onClick={() => setShowScheduleForm(true)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
          >
            Schedule Sale
          </button>
        ) : (
          <form onSubmit={handleSchedule} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input
                type="date"
                value={scheduleData.scheduled_start}
                onChange={(e) =>
                  setScheduleData({ ...scheduleData, scheduled_start: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <input
                type="date"
                value={scheduleData.scheduled_end}
                onChange={(e) =>
                  setScheduleData({ ...scheduleData, scheduled_end: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                required
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium"
              >
                Schedule
              </button>
              <button
                type="button"
                onClick={() => setShowScheduleForm(false)}
                className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      <hr className="my-6" />

      {/* Inventory Adjustment */}
      <div className="mb-6">
        <h4 className="font-medium text-gray-900 mb-3">Inventory Management</h4>
        {!showInventoryForm ? (
          <button
            onClick={() => setShowInventoryForm(true)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
          >
            Adjust Inventory
          </button>
        ) : (
          <form onSubmit={handleAdjustInventory} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Adjustment Amount
              </label>
              <input
                type="number"
                value={inventoryData.adjustment}
                onChange={(e) =>
                  setInventoryData({ ...inventoryData, adjustment: parseInt(e.target.value) })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder="e.g., -50 to reduce"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
              <input
                type="text"
                value={inventoryData.reason}
                onChange={(e) => setInventoryData({ ...inventoryData, reason: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder="e.g., Damage, Return"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium"
              >
                Apply
              </button>
              <button
                type="button"
                onClick={() => setShowInventoryForm(false)}
                className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      <hr className="my-6" />

      {/* Price Override */}
      <div>
        <h4 className="font-medium text-gray-900 mb-3">Price Override</h4>
        {!showPriceOverrideForm ? (
          <button
            onClick={() => setShowPriceOverrideForm(true)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
          >
            Set Price Override
          </button>
        ) : (
          <form onSubmit={handlePriceOverride} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Product ID</label>
              <input
                type="text"
                value={priceOverrideData.product_id}
                onChange={(e) =>
                  setPriceOverrideData({ ...priceOverrideData, product_id: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Override Discount %
              </label>
              <input
                type="number"
                value={priceOverrideData.override_discount_percentage}
                onChange={(e) =>
                  setPriceOverrideData({
                    ...priceOverrideData,
                    override_discount_percentage: parseInt(e.target.value),
                  })
                }
                min="0"
                max="100"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                required
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium"
              >
                Apply
              </button>
              <button
                type="button"
                onClick={() => setShowPriceOverrideForm(false)}
                className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default SaleControls;
