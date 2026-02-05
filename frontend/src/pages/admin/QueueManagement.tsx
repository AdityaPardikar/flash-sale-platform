import React, { useState } from 'react';
import QueueList from '../../components/admin/QueueList';
import QueueDetails from '../../components/admin/QueueDetails';

const QueueManagement: React.FC = () => {
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Queue Management</h1>
          <p className="text-gray-600 mt-2">
            Monitor and manage user queues, manually admit users, and control queue operations
          </p>
        </div>

        {/* Main Content */}
        {!selectedSaleId ? (
          // Queue List View
          <div className="space-y-6">
            <QueueList onSelectQueue={setSelectedSaleId} />
          </div>
        ) : (
          // Queue Details View
          <div className="space-y-6">
            <button
              onClick={() => setSelectedSaleId(null)}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium"
            >
              ← Back to Queue List
            </button>
            <QueueDetails saleId={selectedSaleId} onClose={() => setSelectedSaleId(null)} />
          </div>
        )}
      </div>
    </div>
  );
};

export default QueueManagement;
