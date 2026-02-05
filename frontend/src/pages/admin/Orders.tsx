import React, { useState } from 'react';
import OrderList from '../../components/admin/OrderList';
import OrderDetails from '../../components/admin/OrderDetails';

const Orders: React.FC = () => {
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Order Management</h1>
          <p className="text-gray-600 mt-2">View, search, and manage customer orders</p>
        </div>

        {!selectedOrderId ? (
          <OrderList onSelectOrder={setSelectedOrderId} />
        ) : (
          <div className="space-y-6">
            <button
              onClick={() => setSelectedOrderId(null)}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              ← Back to Orders
            </button>
            <OrderDetails orderId={selectedOrderId} onClose={() => setSelectedOrderId(null)} />
          </div>
        )}
      </div>
    </div>
  );
};

export default Orders;
