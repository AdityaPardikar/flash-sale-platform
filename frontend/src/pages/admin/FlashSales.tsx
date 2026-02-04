/**
 * Flash Sales Management Page
 * Main admin page for managing all flash sales
 */

import React, { useState } from 'react';
import FlashSaleForm from '../../components/admin/FlashSaleForm';
import FlashSaleList from '../../components/admin/FlashSaleList';

type ViewMode = 'list' | 'create' | 'edit' | 'details';

export const FlashSalesPage: React.FC = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleCreateClick = () => {
    setSelectedSaleId(null);
    setViewMode('create');
  };

  const handleEditClick = (saleId: string) => {
    setSelectedSaleId(saleId);
    setViewMode('edit');
  };

  const handleViewDetailsClick = (saleId: string) => {
    setSelectedSaleId(saleId);
    setViewMode('details');
  };

  const handleFormSuccess = (sale: any) => {
    setSuccessMessage(`Flash sale "${sale.name}" saved successfully!`);
    setViewMode('list');
    setTimeout(() => setSuccessMessage(null), 5000);
  };

  const handleFormCancel = () => {
    setViewMode('list');
  };

  return (
    <div className="p-6 bg-gray-100 min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Flash Sales Management</h1>
        <p className="text-gray-600">Create, manage, and monitor flash sales</p>
      </div>

      {/* Success Message */}
      {successMessage && (
        <div className="mb-6 p-4 bg-green-100 border border-green-400 text-green-700 rounded-lg">
          {successMessage}
        </div>
      )}

      {/* View Mode Switcher */}
      {viewMode === 'list' && (
        <>
          <div className="mb-6">
            <button
              onClick={handleCreateClick}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium transition-colors"
            >
              + Create New Sale
            </button>
          </div>
          <FlashSaleList onEdit={handleEditClick} onViewDetails={handleViewDetailsClick} />
        </>
      )}

      {viewMode === 'create' && (
        <div className="max-w-4xl mx-auto">
          <FlashSaleForm onSuccess={handleFormSuccess} onCancel={handleFormCancel} />
        </div>
      )}

      {viewMode === 'edit' && selectedSaleId && (
        <div className="max-w-4xl mx-auto">
          <FlashSaleForm
            saleId={selectedSaleId}
            onSuccess={handleFormSuccess}
            onCancel={handleFormCancel}
          />
        </div>
      )}

      {viewMode === 'details' && selectedSaleId && (
        <SaleDetailsView saleId={selectedSaleId} onBack={() => setViewMode('list')} />
      )}
    </div>
  );
};

/**
 * Sale Details View Component
 * Displays detailed information about a specific sale
 */
interface SaleDetailsViewProps {
  saleId: string;
  onBack: () => void;
}

const SaleDetailsView: React.FC<SaleDetailsViewProps> = ({ saleId, onBack }) => {
  return (
    <div>
      <button
        onClick={onBack}
        className="mb-6 px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 font-medium"
      >
        ← Back to List
      </button>
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-2xl font-bold mb-4">Sale Details</h2>
        <p className="text-gray-600">Sale ID: {saleId}</p>
        <div className="mt-6 p-4 bg-blue-100 border border-blue-400 text-blue-700 rounded">
          Detailed view coming soon. Use the Analytics Dashboard to view comprehensive metrics.
        </div>
      </div>
    </div>
  );
};

export default FlashSalesPage;
