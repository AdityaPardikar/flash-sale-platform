import React, { useState, useEffect } from 'react';
import API from '../../services/api';

interface Queue {
  sale_id: string;
  sale_name: string;
  waiting_count: number;
  admitted_count: number;
  dropped_count: number;
  avg_wait_ms: number;
  max_wait_ms: number;
  sale_status: string;
}

interface Props {
  onSelectQueue: (saleId: string) => void;
}

const QueueList: React.FC<Props> = ({ onSelectQueue }) => {
  const [queues, setQueues] = useState<Queue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSale, setSelectedSale] = useState<string | null>(null);

  useEffect(() => {
    fetchQueues();
  }, []);

  const fetchQueues = async () => {
    try {
      setLoading(true);
      const response = await API.get('/admin/queues');
      setQueues(response.data.queues);
      setError(null);
    } catch (err) {
      setError('Failed to fetch queues');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const formatWaitTime = (ms: number) => {
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    return `${Math.round(ms / 60000)}m`;
  };

  const handleViewDetails = (saleId: string) => {
    setSelectedSale(saleId);
    onSelectQueue(saleId);
  };

  if (loading) {
    return <div className="p-6 text-center">Loading queues...</div>;
  }

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div className="p-6 border-b border-gray-200">
        <h3 className="text-xl font-bold text-gray-800">Active Queues</h3>
        <p className="text-sm text-gray-600 mt-1">{queues.length} active queue(s)</p>
      </div>

      {error && <div className="p-6 bg-red-50 text-red-700">{error}</div>}

      {queues.length === 0 ? (
        <div className="p-6 text-center text-gray-500">No active queues at this time</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-100 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                  Sale Name
                </th>
                <th className="px-6 py-3 text-center text-sm font-semibold text-gray-700">
                  Waiting
                </th>
                <th className="px-6 py-3 text-center text-sm font-semibold text-gray-700">
                  Admitted
                </th>
                <th className="px-6 py-3 text-center text-sm font-semibold text-gray-700">
                  Dropped
                </th>
                <th className="px-6 py-3 text-center text-sm font-semibold text-gray-700">
                  Avg Wait
                </th>
                <th className="px-6 py-3 text-center text-sm font-semibold text-gray-700">
                  Max Wait
                </th>
                <th className="px-6 py-3 text-center text-sm font-semibold text-gray-700">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {queues.map((queue) => (
                <tr
                  key={queue.sale_id}
                  className={`border-b hover:bg-gray-50 transition ${
                    selectedSale === queue.sale_id ? 'bg-blue-50' : ''
                  }`}
                >
                  <td className="px-6 py-4 text-sm text-gray-900 font-medium">{queue.sale_name}</td>
                  <td className="px-6 py-4 text-center">
                    <span className="inline-block px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm font-semibold">
                      {queue.waiting_count}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="inline-block px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-semibold">
                      {queue.admitted_count}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="inline-block px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-semibold">
                      {queue.dropped_count}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center text-sm text-gray-700">
                    {formatWaitTime(queue.avg_wait_ms)}
                  </td>
                  <td className="px-6 py-4 text-center text-sm text-gray-700">
                    {formatWaitTime(queue.max_wait_ms)}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <button
                      onClick={() => handleViewDetails(queue.sale_id)}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium"
                    >
                      View Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default QueueList;
