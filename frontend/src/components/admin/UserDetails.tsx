import React, { useState, useEffect } from 'react';
import { API } from '../../services/api';

interface UserDetail {
  id: string;
  email: string;
  phone_number?: string;
  status: 'active' | 'suspended' | 'banned';
  total_purchases: number;
  total_spent: number;
  last_login: string;
  created_at: string;
}

interface Order {
  id: string;
  sale_id: string;
  sale_name: string;
  total_amount: number;
  status: string;
  created_at: string;
}

interface Props {
  userId: string;
  onClose?: () => void;
}

const UserDetails: React.FC<Props> = ({ userId, onClose }) => {
  const [user, setUser] = useState<UserDetail | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusForm, setStatusForm] = useState({ status: '', reason: '' });
  const [refundForm, setRefundForm] = useState({ order_id: '', amount: '', reason: '' });
  const [showStatusForm, setShowStatusForm] = useState(false);
  const [showRefundForm, setShowRefundForm] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);

  useEffect(() => {
    fetchUserDetails();
    fetchUserOrders();
  }, [userId]);

  const fetchUserDetails = async () => {
    try {
      const response = await API.get(`/admin/users/${userId}`);
      setUser(response.data);
      setStatusForm({ status: response.data.status, reason: '' });
      setError(null);
    } catch (err) {
      setError('Failed to fetch user details');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserOrders = async () => {
    try {
      const response = await API.get(`/admin/users/${userId}/orders?limit=10&offset=0`);
      setOrders(response.data.orders);
    } catch (err) {
      console.error('Error fetching user orders:', err);
    }
  };

  const handleUpdateStatus = async () => {
    if (!statusForm.status) {
      setError('Please select a status');
      return;
    }

    try {
      await API.patch(`/admin/users/${userId}/status`, {
        status: statusForm.status,
        reason: statusForm.reason,
      });
      setShowStatusForm(false);
      await fetchUserDetails();
    } catch (err) {
      setError('Failed to update user status');
      console.error(err);
    }
  };

  const handleProcessRefund = async () => {
    if (!selectedOrder || !refundForm.amount) {
      setError('Please select an order and enter refund amount');
      return;
    }

    try {
      await API.post(`/admin/users/${userId}/refund`, {
        order_id: selectedOrder,
        amount: parseFloat(refundForm.amount),
        reason: refundForm.reason,
      });
      setShowRefundForm(false);
      setRefundForm({ order_id: '', amount: '', reason: '' });
      setSelectedOrder(null);
      await fetchUserOrders();
    } catch (err) {
      setError('Failed to process refund');
      console.error(err);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'suspended':
        return 'bg-yellow-100 text-yellow-800';
      case 'banned':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading && !user) {
    return <div className="p-6 text-center">Loading user details...</div>;
  }

  if (!user) {
    return <div className="p-6 text-center text-red-600">Failed to load user details</div>;
  }

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-gray-200 flex justify-between items-center">
        <div>
          <h3 className="text-2xl font-bold text-gray-900">{user.email}</h3>
          <p className="text-sm text-gray-600 mt-1">User ID: {user.id.substring(0, 12)}...</p>
        </div>
        {onClose && (
          <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:text-gray-900 text-lg">
            ✕
          </button>
        )}
      </div>

      {error && <div className="p-6 bg-red-50 text-red-700 border-b border-red-200">{error}</div>}

      {/* User Info Grid */}
      <div className="grid grid-cols-4 gap-4 p-6 bg-gray-50 border-b">
        <div className="bg-white p-4 rounded border border-gray-200">
          <div className="text-2xl font-bold text-blue-600">{user.total_purchases}</div>
          <div className="text-sm text-gray-600 mt-1">Total Orders</div>
        </div>
        <div className="bg-white p-4 rounded border border-gray-200">
          <div className="text-2xl font-bold text-green-600">${user.total_spent.toFixed(2)}</div>
          <div className="text-sm text-gray-600 mt-1">Total Spent</div>
        </div>
        <div className="bg-white p-4 rounded border border-gray-200">
          <div
            className={`text-xl font-bold px-3 py-1 rounded inline-block ${getStatusColor(user.status)}`}
          >
            {user.status}
          </div>
          <div className="text-sm text-gray-600 mt-2">Current Status</div>
        </div>
        <div className="bg-white p-4 rounded border border-gray-200">
          <div className="text-sm font-semibold text-gray-700">
            {user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never logged in'}
          </div>
          <div className="text-sm text-gray-600 mt-1">Last Login</div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="p-6 border-b border-gray-200 flex gap-3">
        <button
          onClick={() => setShowStatusForm(!showStatusForm)}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium"
        >
          Change Status
        </button>
        <button
          onClick={() => setShowRefundForm(!showRefundForm)}
          className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 font-medium"
        >
          Process Refund
        </button>
      </div>

      {/* Status Change Form */}
      {showStatusForm && (
        <div className="p-6 bg-blue-50 border-b border-blue-200">
          <h4 className="font-semibold text-gray-800 mb-3">Change User Status</h4>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">New Status</label>
              <select
                value={statusForm.status}
                onChange={(e) => setStatusForm({ ...statusForm, status: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select status...</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="banned">Banned</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reason (optional)
              </label>
              <textarea
                value={statusForm.reason}
                onChange={(e) => setStatusForm({ ...statusForm, reason: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder="Reason for status change..."
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleUpdateStatus}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium"
              >
                Update Status
              </button>
              <button
                onClick={() => setShowStatusForm(false)}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Refund Form */}
      {showRefundForm && (
        <div className="p-6 bg-orange-50 border-b border-orange-200">
          <h4 className="font-semibold text-gray-800 mb-3">Process Refund</h4>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Select Order</label>
              <select
                value={selectedOrder || ''}
                onChange={(e) => setSelectedOrder(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="">Select an order...</option>
                {orders.map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.sale_name} - ${order.total_amount.toFixed(2)} ({order.status})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Refund Amount ($)
              </label>
              <input
                type="number"
                step="0.01"
                value={refundForm.amount}
                onChange={(e) => setRefundForm({ ...refundForm, amount: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Reason</label>
              <textarea
                value={refundForm.reason}
                onChange={(e) => setRefundForm({ ...refundForm, reason: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-orange-500"
                rows={3}
                placeholder="Reason for refund..."
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleProcessRefund}
                className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 font-medium"
              >
                Process Refund
              </button>
              <button
                onClick={() => setShowRefundForm(false)}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Orders Section */}
      <div className="p-6 border-t border-gray-200">
        <h4 className="font-semibold text-gray-800 mb-4">Recent Orders</h4>
        {orders.length === 0 ? (
          <p className="text-gray-500">No orders found</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100 border-b">
                <tr>
                  <th className="px-4 py-2 text-left">Order ID</th>
                  <th className="px-4 py-2 text-left">Sale</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-left">Date</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-700 font-mono text-xs">
                      {order.id.substring(0, 8)}...
                    </td>
                    <td className="px-4 py-2 text-gray-700">{order.sale_name}</td>
                    <td className="px-4 py-2 text-right text-gray-700 font-semibold">
                      ${order.total_amount.toFixed(2)}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`px-2 py-1 rounded text-xs font-semibold ${
                          order.status === 'completed'
                            ? 'bg-green-100 text-green-800'
                            : order.status === 'pending'
                              ? 'bg-yellow-100 text-yellow-800'
                              : order.status === 'refunded'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {order.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-700">
                      {new Date(order.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserDetails;
