import React, { useState, useEffect } from 'react';
import API from '../../services/api';

interface QueueUser {
  user_id: string;
  status: 'waiting' | 'admitted' | 'dropped';
  position: number;
  created_at: string;
  updated_at: string;
  wait_time_ms: number;
}

interface QueueDetailsData {
  sale: { id: string; name: string; status: string };
  stats: { total_in_queue: number; waiting: number; admitted: number; dropped: number };
  users: QueueUser[];
  pagination: { total: number; limit: number; offset: number };
}

interface Props {
  saleId: string;
  onClose?: () => void;
}

const QueueDetails: React.FC<Props> = ({ saleId, onClose }) => {
  const [data, setData] = useState<QueueDetailsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [showAdmitForm, setShowAdmitForm] = useState(false);
  const [admitCount, setAdmitCount] = useState(10);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => {
    fetchDetails();
  }, [saleId, limit, offset]);

  const fetchDetails = async () => {
    try {
      setLoading(true);
      const response = await API.get(`/admin/queues/${saleId}?limit=${limit}&offset=${offset}`);
      setData(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to fetch queue details');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdmitUsers = async () => {
    try {
      await API.post(`/admin/queues/${saleId}/admit`, {
        count: admitCount,
      });
      setShowAdmitForm(false);
      setAdmitCount(10);
      await fetchDetails();
    } catch (err) {
      setError('Failed to admit users');
      console.error(err);
    }
  };

  const handleRemoveUser = async (userId: string) => {
    if (!window.confirm(`Remove ${userId} from queue?`)) return;

    try {
      await API.delete(`/admin/queues/${saleId}/user/${userId}`, {
        data: { reason: 'Removed by admin' },
      });
      await fetchDetails();
    } catch (err) {
      setError('Failed to remove user');
      console.error(err);
    }
  };

  const handleClearQueue = async () => {
    if (!window.confirm('Clear entire queue? All waiting users will be removed.')) return;

    try {
      await API.post(`/admin/queues/${saleId}/clear`, {
        reason: 'Queue cleared by admin',
      });
      setShowClearConfirm(false);
      await fetchDetails();
    } catch (err) {
      setError('Failed to clear queue');
      console.error(err);
    }
  };

  const formatWaitTime = (ms: number) => {
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    return `${Math.round(ms / 60000)}m`;
  };

  if (loading && !data) {
    return <div className="p-6 text-center">Loading queue details...</div>;
  }

  if (!data) {
    return <div className="p-6 text-center text-red-600">Failed to load queue details</div>;
  }

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div className="p-6 border-b border-gray-200 flex justify-between items-center">
        <div>
          <h3 className="text-xl font-bold text-gray-800">{data.sale.name} - Queue Details</h3>
          <p className="text-sm text-gray-600 mt-1">Sale ID: {data.sale.id}</p>
        </div>
        {onClose && (
          <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:text-gray-900 text-lg">
            ✕
          </button>
        )}
      </div>

      {error && <div className="p-6 bg-red-50 text-red-700 border-b border-red-200">{error}</div>}

      {/* Statistics Grid */}
      <div className="grid grid-cols-4 gap-4 p-6 bg-gray-50 border-b">
        <div className="bg-white p-4 rounded border border-gray-200">
          <div className="text-2xl font-bold text-blue-600">{data.stats.total_in_queue}</div>
          <div className="text-sm text-gray-600">Total in Queue</div>
        </div>
        <div className="bg-white p-4 rounded border border-gray-200">
          <div className="text-2xl font-bold text-yellow-600">{data.stats.waiting}</div>
          <div className="text-sm text-gray-600">Waiting</div>
        </div>
        <div className="bg-white p-4 rounded border border-gray-200">
          <div className="text-2xl font-bold text-green-600">{data.stats.admitted}</div>
          <div className="text-sm text-gray-600">Admitted</div>
        </div>
        <div className="bg-white p-4 rounded border border-gray-200">
          <div className="text-2xl font-bold text-red-600">{data.stats.dropped}</div>
          <div className="text-sm text-gray-600">Dropped</div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="p-6 border-b border-gray-200 flex gap-3">
        <button
          onClick={() => setShowAdmitForm(!showAdmitForm)}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-medium"
        >
          Admit Users
        </button>
        <button
          onClick={() => setShowClearConfirm(true)}
          className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 font-medium"
        >
          Clear Queue
        </button>
        <button
          onClick={() => fetchDetails()}
          className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 font-medium ml-auto"
        >
          Refresh
        </button>
      </div>

      {/* Admit Form */}
      {showAdmitForm && (
        <div className="p-6 bg-green-50 border-b border-green-200">
          <h4 className="font-semibold text-gray-800 mb-3">Admit Users to Checkout</h4>
          <div className="flex gap-3">
            <input
              type="number"
              min="1"
              max="100"
              value={admitCount}
              onChange={(e) => setAdmitCount(parseInt(e.target.value))}
              className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Number of users to admit"
            />
            <button
              onClick={handleAdmitUsers}
              className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-medium"
            >
              Admit
            </button>
            <button
              onClick={() => setShowAdmitForm(false)}
              className="px-6 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Clear Confirmation */}
      {showClearConfirm && (
        <div className="p-6 bg-red-50 border-b border-red-200">
          <h4 className="font-semibold text-red-800 mb-3">Clear Entire Queue?</h4>
          <p className="text-sm text-red-700 mb-4">
            This will remove all {data.stats.waiting} waiting users from the queue.
          </p>
          <div className="flex gap-3">
            <button
              onClick={handleClearQueue}
              className="px-6 py-2 bg-red-600 text-white rounded hover:bg-red-700 font-medium"
            >
              Clear Queue
            </button>
            <button
              onClick={() => setShowClearConfirm(false)}
              className="px-6 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-100 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Position</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">User ID</th>
              <th className="px-6 py-3 text-center text-sm font-semibold text-gray-700">Status</th>
              <th className="px-6 py-3 text-center text-sm font-semibold text-gray-700">
                Wait Time
              </th>
              <th className="px-6 py-3 text-center text-sm font-semibold text-gray-700">
                Joined At
              </th>
              <th className="px-6 py-3 text-center text-sm font-semibold text-gray-700">Action</th>
            </tr>
          </thead>
          <tbody>
            {data.users.map((user) => (
              <tr key={`${user.user_id}-${user.status}`} className="border-b hover:bg-gray-50">
                <td className="px-6 py-4 text-sm text-gray-900 font-medium">{user.position}</td>
                <td className="px-6 py-4 text-sm text-gray-700">
                  {user.user_id.substring(0, 8)}...
                </td>
                <td className="px-6 py-4 text-center">
                  <span
                    className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${
                      user.status === 'waiting'
                        ? 'bg-yellow-100 text-yellow-800'
                        : user.status === 'admitted'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {user.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-center text-sm text-gray-700">
                  {formatWaitTime(user.wait_time_ms)}
                </td>
                <td className="px-6 py-4 text-center text-sm text-gray-700">
                  {new Date(user.created_at).toLocaleTimeString()}
                </td>
                <td className="px-6 py-4 text-center">
                  {user.status === 'waiting' && (
                    <button
                      onClick={() => handleRemoveUser(user.user_id)}
                      className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="p-4 border-t border-gray-200 flex justify-between items-center">
        <div className="text-sm text-gray-600">
          Showing {offset + 1} to {Math.min(offset + limit, data.pagination.total)} of{' '}
          {data.pagination.total} users
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0}
            className="px-3 py-1 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 disabled:opacity-50"
          >
            Previous
          </button>
          <button
            onClick={() => setOffset(offset + limit)}
            disabled={offset + limit >= data.pagination.total}
            className="px-3 py-1 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default QueueDetails;
