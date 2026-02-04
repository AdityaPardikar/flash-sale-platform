/**
 * Flash Sale Form Component
 * Form for creating and editing flash sales
 */

import React, { useState, useEffect } from 'react';
import { API } from '../../services/api';

interface FlashSaleFormProps {
  saleId?: string;
  onSuccess?: (sale: any) => void;
  onCancel?: () => void;
}

export const FlashSaleForm: React.FC<FlashSaleFormProps> = ({ saleId, onSuccess, onCancel }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    discount_percentage: 10,
    start_time: new Date().toISOString().split('T')[0],
    end_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    product_ids: [] as string[],
    max_purchases_per_user: 1,
    total_inventory: 1000,
  });

  const [products, setProducts] = useState<any[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);

  // Fetch existing sale if editing
  useEffect(() => {
    if (saleId) {
      fetchSale();
    }
    fetchProducts();
  }, [saleId]);

  const fetchSale = async () => {
    try {
      const response = await API.get(`/admin/sales/${saleId}`);
      setFormData({
        name: response.name,
        description: response.description,
        discount_percentage: response.discount_percentage,
        start_time: new Date(response.start_time).toISOString().split('T')[0],
        end_time: new Date(response.end_time).toISOString().split('T')[0],
        product_ids: response.product_ids || [],
        max_purchases_per_user: response.max_purchases_per_user,
        total_inventory: response.total_inventory,
      });
    } catch (err) {
      setError('Failed to load sale details');
    }
  };

  const fetchProducts = async () => {
    try {
      setProductsLoading(true);
      const response = await API.get('/products?limit=100');
      setProducts(response.data || []);
    } catch (err) {
      console.error('Error fetching products:', err);
    } finally {
      setProductsLoading(false);
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'number' ? parseInt(value) : value,
    }));
  };

  const handleProductSelect = (productId: string, checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      product_ids: checked
        ? [...prev.product_ids, productId]
        : prev.product_ids.filter((id) => id !== productId),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Validation
      if (!formData.name.trim()) {
        throw new Error('Sale name is required');
      }

      if (formData.discount_percentage <= 0 || formData.discount_percentage > 100) {
        throw new Error('Discount must be between 0 and 100');
      }

      const startDate = new Date(formData.start_time);
      const endDate = new Date(formData.end_time);

      if (startDate >= endDate) {
        throw new Error('Start time must be before end time');
      }

      if (formData.product_ids.length === 0) {
        throw new Error('Select at least one product');
      }

      const payload = {
        ...formData,
        start_time: startDate.toISOString(),
        end_time: endDate.toISOString(),
      };

      let response;
      if (saleId) {
        response = await API.put(`/admin/sales/${saleId}`, payload);
      } else {
        response = await API.post('/admin/sales', payload);
      }

      if (onSuccess) {
        onSuccess(response);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save sale');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold mb-6">
        {saleId ? 'Edit Flash Sale' : 'Create Flash Sale'}
      </h2>

      {error && (
        <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Sale Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Sale Name *</label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleInputChange}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-600 focus:border-transparent"
            placeholder="e.g., Valentine's Day Sale"
            required
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleInputChange}
            rows={3}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-600 focus:border-transparent"
            placeholder="Sale description..."
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Discount Percentage */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Discount % *</label>
            <input
              type="number"
              name="discount_percentage"
              value={formData.discount_percentage}
              onChange={handleInputChange}
              min="0"
              max="100"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-600 focus:border-transparent"
              required
            />
          </div>

          {/* Max Purchases Per User */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Max Purchases/User *
            </label>
            <input
              type="number"
              name="max_purchases_per_user"
              value={formData.max_purchases_per_user}
              onChange={handleInputChange}
              min="1"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-600 focus:border-transparent"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Start Time */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Start Time *</label>
            <input
              type="date"
              name="start_time"
              value={formData.start_time}
              onChange={handleInputChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-600 focus:border-transparent"
              required
            />
          </div>

          {/* End Time */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">End Time *</label>
            <input
              type="date"
              name="end_time"
              value={formData.end_time}
              onChange={handleInputChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-600 focus:border-transparent"
              required
            />
          </div>
        </div>

        {/* Total Inventory */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Total Inventory *</label>
          <input
            type="number"
            name="total_inventory"
            value={formData.total_inventory}
            onChange={handleInputChange}
            min="1"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-600 focus:border-transparent"
            required
          />
        </div>

        {/* Products Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">Select Products *</label>
          {productsLoading ? (
            <div className="text-center text-gray-500">Loading products...</div>
          ) : (
            <div className="max-h-64 overflow-y-auto border border-gray-300 rounded-lg p-4 space-y-2">
              {products.length === 0 ? (
                <div className="text-center text-gray-500">No products available</div>
              ) : (
                products.map((product) => (
                  <label key={product.id} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.product_ids.includes(product.id)}
                      onChange={(e) => handleProductSelect(product.id, e.target.checked)}
                      className="w-4 h-4 text-indigo-600 rounded"
                    />
                    <span className="ml-2 text-sm text-gray-700">
                      {product.name} (${product.price})
                    </span>
                  </label>
                ))
              )}
            </div>
          )}
          {formData.product_ids.length === 0 && (
            <p className="text-red-500 text-sm mt-2">Select at least one product</p>
          )}
        </div>

        {/* Form Actions */}
        <div className="flex gap-4 pt-4">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium transition-colors"
          >
            {loading ? 'Saving...' : saleId ? 'Update Sale' : 'Create Sale'}
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg hover:bg-gray-300 font-medium transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  );
};

export default FlashSaleForm;
