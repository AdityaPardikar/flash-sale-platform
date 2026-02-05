import React, { useState, useEffect } from 'react';
import API from '../../services/api';

interface User {
  id: string;
  email: string;
  phone_number?: string;
  status: 'active' | 'suspended' | 'banned';
  total_purchases: number;
  total_spent: number;
  last_login: string;
}

interface Props {
  onSelectUser: (userId: string) => void;
}

const UserSearch: React.FC<Props> = ({ onSelectUser }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('');
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (status) params.append('status', status);
      params.append('limit', limit.toString());
      params.append('offset', offset.toString());

      const response = await API.get(`/admin/users?${params.toString()}`);
      setUsers(response.data.users);
      setTotalCount(response.data.pagination.total);
      setError(null);
    } catch (err) {
      setError('Failed to fetch users');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const debounce = setTimeout(fetchUsers, 500);
    return () => clearTimeout(debounce);
  }, [search, status, limit, offset]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'text-green-600 bg-green-100';
      case 'suspended':
        return 'text-yellow-600 bg-yellow-100';
      case 'banned':
        return 'text-red-600 bg-red-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div className="p-6 border-b border-gray-200">
        <h3 className="text-xl font-bold text-gray-800 mb-4">User Search</h3>

        {/* Search and Filter */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <input
            type="text"
            placeholder="Search by email or phone..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
            }}
            className="px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setOffset(0);
            }}
            className="px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="banned">Banned</option>
          </select>
          <select
            value={limit}
            onChange={(e) => {
              setLimit(parseInt(e.target.value));
              setOffset(0);
            }}
            className="px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="10">10 per page</option>
            <option value="25">25 per page</option>
            <option value="50">50 per page</option>
            <option value="100">100 per page</option>
          </select>
        </div>

        {error && (
          <div className="p-3 bg-red-50 text-red-700 rounded border border-red-200 mb-4">
            {error}
          </div>
        )}
      </div>

      {/* Results */}
      {loading ? (
        <div className="p-6 text-center text-gray-500">Loading users...</div>
      ) : users.length === 0 ? (
        <div className="p-6 text-center text-gray-500">No users found</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-100 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Email</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                    Status
                  </th>
                  <th className="px-6 py-3 text-center text-sm font-semibold text-gray-700">
                    Orders
                  </th>
                  <th className="px-6 py-3 text-center text-sm font-semibold text-gray-700">
                    Total Spent
                  </th>
                  <th className="px-6 py-3 text-center text-sm font-semibold text-gray-700">
                    Last Login
                  </th>
                  <th className="px-6 py-3 text-center text-sm font-semibold text-gray-700">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b hover:bg-gray-50 transition">
                    <td className="px-6 py-4 text-sm text-gray-900 font-medium">{user.email}</td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(user.status)}`}
                      >
                        {user.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-700">
                      {user.total_purchases}
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-700">
                      ${user.total_spent.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-700">
                      {user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => onSelectUser(user.id)}
                        className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 font-medium"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="p-4 border-t border-gray-200 flex justify-between items-center">
            <div className="text-sm text-gray-600">
              Showing {offset + 1} to {Math.min(offset + limit, totalCount)} of {totalCount} users
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
                disabled={offset + limit >= totalCount}
                className="px-3 py-1 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default UserSearch;
