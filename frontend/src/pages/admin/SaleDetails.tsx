/**
 * Sale Details Page
 * Comprehensive view of a specific sale with metrics and controls
 */

import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import SaleMetrics from '../../components/admin/SaleMetrics';
import SaleControls from '../../components/admin/SaleControls';
import { API } from '../../services/api';

interface SaleInfo {
  id: string;
  name: string;
  description: string;
  discount_percentage: number;
  status: string;
  start_time: Date;
  end_time: Date;
  total_inventory: number;
  remaining_inventory: number;
}

export const SaleDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [sale, setSale] = useState<SaleInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saleStatus, setSaleStatus] = useState<string>('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (id) {
      fetchSale();
    }
  }, [id]);

  const fetchSale = async () => {
    try {
      setLoading(true);
      const response = await API.get(`/admin/sales/${id}`);
      setSale(response);
      setSaleStatus(response.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sale');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = (newStatus: string) => {
    setSaleStatus(newStatus);
    setRefreshKey((prev) => prev + 1);
    // Refresh sale info
    fetchSale();
  };

  const handleError = (error: string) => {
    setError(error);
    setTimeout(() => setError(null), 5000);
  };

  if (loading) {
    return <div className="p-6 text-center text-gray-500">Loading sale details...</div>;
  }

  if (!id || !sale) {
    return (
      <div className="p-6 bg-gray-100 min-h-screen">
        <div className="text-center py-12 bg-white rounded-lg shadow-md">
          <p className="text-gray-600">Sale not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-100 min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">{sale.name}</h1>
        <p className="text-gray-600 mt-1">{sale.description}</p>
        <div className="flex gap-4 mt-4">
          <span className="inline-block px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
            {sale.discount_percentage}% OFF
          </span>
          <span
            className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
              saleStatus === 'active'
                ? 'bg-green-100 text-green-800'
                : saleStatus === 'paused'
                  ? 'bg-yellow-100 text-yellow-800'
                  : saleStatus === 'scheduled'
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-gray-100 text-gray-800'
            }`}
          >
            {saleStatus.charAt(0).toUpperCase() + saleStatus.slice(1)}
          </span>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      {/* Main Content */}
      <div className="grid grid-cols-3 gap-6">
        {/* Left Column - Metrics and Info */}
        <div className="col-span-2 space-y-6">
          <SaleMetrics key={refreshKey} saleId={id} refreshInterval={5000} />
        </div>

        {/* Right Column - Controls */}
        <div>
          <SaleControls
            saleId={id}
            currentStatus={saleStatus}
            onStatusChange={handleStatusChange}
            onError={handleError}
          />

          {/* Sale Info Card */}
          <div className="mt-6 bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold mb-4">Sale Information</h3>
            <div className="space-y-3 text-sm">
              <div>
                <div className="text-gray-600 font-medium">Sale ID</div>
                <div className="text-gray-900 font-mono">{sale.id}</div>
              </div>
              <div>
                <div className="text-gray-600 font-medium">Start Time</div>
                <div className="text-gray-900">{new Date(sale.start_time).toLocaleString()}</div>
              </div>
              <div>
                <div className="text-gray-600 font-medium">End Time</div>
                <div className="text-gray-900">{new Date(sale.end_time).toLocaleString()}</div>
              </div>
              <div>
                <div className="text-gray-600 font-medium">Duration</div>
                <div className="text-gray-900">
                  {Math.round(
                    (new Date(sale.end_time).getTime() - new Date(sale.start_time).getTime()) /
                      3600000
                  )}{' '}
                  hours
                </div>
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="mt-6 bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold mb-4">Inventory Summary</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Total Stock</span>
                <span className="font-bold text-gray-900">{sale.total_inventory}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Remaining</span>
                <span className="font-bold text-blue-600">{sale.remaining_inventory}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Sold</span>
                <span className="font-bold text-green-600">
                  {sale.total_inventory - sale.remaining_inventory}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SaleDetailsPage;
