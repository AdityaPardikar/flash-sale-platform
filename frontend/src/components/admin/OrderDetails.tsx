import React, { useState, useEffect } from 'react';
import API from '../../services/api';

interface OrderDetail {
  id: string;
  user_id: string;
  sale_id: string;
  sale_name: string;
  total_amount: number;
  status: string;
  items: Array<{ product_id: string; product_name: string; quantity: number; price: number }>;
  created_at: string;
  updated_at: string;
}

interface Props {
  orderId: string;
  onClose?: () => void;
}

const OrderDetails: React.FC<Props> = ({ orderId, onClose }) => {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  useEffect(() => {
    fetchOrderDetails();
  }, [orderId]);

  const fetchOrderDetails = async () => {
    try {
      const response = await API.get(`/admin/orders/${orderId}`);
      setOrder(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to fetch order details');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!cancelReason.trim()) {
      setError('Please provide a reason for cancellation');
      return;
    }

    try {
      await API.post(`/admin/orders/${orderId}/cancel`, {
        reason: cancelReason,
      });
      setShowCancelForm(false);
      setCancelReason('');
      await fetchOrderDetails();
    } catch (err) {
      setError('Failed to cancel order');
      console.error(err);
    }
  };

  if (loading) return <div className="p-6 text-center">Loading...</div>;
  if (!order) return <div className="p-6 text-center text-red-600">Order not found</div>;

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div className="p-6 border-b border-gray-200 flex justify-between">
        <div>
          <h3 className="text-2xl font-bold">Order #{order.id.substring(0, 12)}</h3>
          <p className="text-sm text-gray-600 mt-1">Sale: {order.sale_name}</p>
        </div>
        <div className="text-right">
          <div
            className={`inline-block px-4 py-2 rounded-full font-semibold text-white ${
              order.status === 'completed'
                ? 'bg-green-600'
                : order.status === 'pending'
                  ? 'bg-yellow-600'
                  : order.status === 'cancelled'
                    ? 'bg-red-600'
                    : 'bg-blue-600'
            }`}
          >
            {order.status.toUpperCase()}
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-lg">
            ✕
          </button>
        )}
      </div>

      {error && <div className="p-6 bg-red-50 text-red-700 border-b">{error}</div>}

      {/* Order Stats */}
      <div className="grid grid-cols-3 gap-4 p-6 bg-gray-50 border-b">
        <div>
          <div className="text-2xl font-bold text-blue-600">${order.total_amount.toFixed(2)}</div>
          <div className="text-sm text-gray-600">Total Amount</div>
        </div>
        <div>
          <div className="text-lg font-semibold text-gray-700">
            {new Date(order.created_at).toLocaleDateString()}
          </div>
          <div className="text-sm text-gray-600">Order Date</div>
        </div>
        <div>
          <div className="text-lg font-semibold text-gray-700">{order.items.length} item(s)</div>
          <div className="text-sm text-gray-600">Items</div>
        </div>
      </div>

      {/* Items */}
      <div className="p-6 border-b">
        <h4 className="font-semibold text-gray-800 mb-4">Order Items</h4>
        <table className="w-full text-sm">
          <thead className="border-b">
            <tr>
              <th className="text-left py-2">Product</th>
              <th className="text-center">Quantity</th>
              <th className="text-right">Price</th>
              <th className="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item, i) => (
              <tr key={i} className="border-b">
                <td className="py-3">{item.product_name}</td>
                <td className="text-center">{item.quantity}</td>
                <td className="text-right">${item.price.toFixed(2)}</td>
                <td className="text-right font-semibold">
                  ${(item.quantity * item.price).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Actions */}
      {order.status !== 'cancelled' && (
        <div className="p-6 border-b flex gap-3">
          <button
            onClick={() => setShowCancelForm(!showCancelForm)}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Cancel Order
          </button>
        </div>
      )}

      {/* Cancel Form */}
      {showCancelForm && (
        <div className="p-6 bg-red-50 border-b">
          <h4 className="font-semibold text-red-900 mb-3">Cancel Order</h4>
          <textarea
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            className="w-full px-3 py-2 border rounded mb-3"
            placeholder="Reason for cancellation..."
            rows={3}
          />
          <div className="flex gap-3">
            <button
              onClick={handleCancelOrder}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Confirm Cancellation
            </button>
            <button
              onClick={() => {
                setShowCancelForm(false);
                setCancelReason('');
              }}
              className="px-4 py-2 bg-gray-300 text-gray-700 rounded"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Order Info */}
      <div className="p-6 bg-gray-50">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-gray-600">User ID</div>
            <div className="font-mono">{order.user_id.substring(0, 16)}...</div>
          </div>
          <div>
            <div className="text-gray-600">Sale ID</div>
            <div className="font-mono">{order.sale_id.substring(0, 16)}...</div>
          </div>
          <div>
            <div className="text-gray-600">Created</div>
            <div>{new Date(order.created_at).toLocaleString()}</div>
          </div>
          <div>
            <div className="text-gray-600">Updated</div>
            <div>{new Date(order.updated_at).toLocaleString()}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderDetails;
