import React, { useState } from 'react';
import UserSearch from '../../components/admin/UserSearch';
import UserDetails from '../../components/admin/UserDetails';

const Users: React.FC = () => {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
          <p className="text-gray-600 mt-2">
            Search users, manage their status, view order history, and process refunds
          </p>
        </div>

        {/* Main Content */}
        {!selectedUserId ? (
          // User Search View
          <UserSearch onSelectUser={setSelectedUserId} />
        ) : (
          // User Details View
          <div className="space-y-6">
            <button
              onClick={() => setSelectedUserId(null)}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium"
            >
              ← Back to User Search
            </button>
            <UserDetails userId={selectedUserId} onClose={() => setSelectedUserId(null)} />
          </div>
        )}
      </div>
    </div>
  );
};

export default Users;
