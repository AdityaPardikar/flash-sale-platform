/**
 * Flash Sales Management Page
 * Main admin page for managing all flash sales
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import FlashSaleForm from '../../components/admin/FlashSaleForm';
import FlashSaleList from '../../components/admin/FlashSaleList';
import { useToast } from '../../contexts/ToastContext';

interface FlashSale {
  name: string;
  id?: string;
}

type ViewMode = 'list' | 'create' | 'edit';

export const FlashSalesPage: React.FC = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const navigate = useNavigate();
  const toast = useToast();

  const handleCreateClick = () => {
    setSelectedSaleId(null);
    setViewMode('create');
  };

  const handleEditClick = (saleId: string) => {
    setSelectedSaleId(saleId);
    setViewMode('edit');
  };

  const handleViewDetailsClick = (saleId: string) => {
    navigate(`/admin/sales/${saleId}`);
  };

  const handleFormSuccess = (sale: FlashSale) => {
    toast.success(`Flash sale "${sale.name}" saved successfully!`);
    setViewMode('list');
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
    </div>
  );
};

export default FlashSalesPage;
