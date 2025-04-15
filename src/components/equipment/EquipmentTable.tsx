import React from 'react';
import { FaEdit, FaTrash, FaUserCheck, FaInfoCircle } from 'react-icons/fa';
import { Equipment } from '@/lib/interfaces/equipment';

interface EquipmentTableProps {
  equipment: Equipment[];
  isLoading?: boolean;
  onEdit?: (item: Equipment) => void;
  onDelete?: (id: string) => void;
  onAssign?: (item: Equipment) => void;
  onViewDetails?: (item: Equipment) => void;
}

export default function EquipmentTable({
  equipment,
  isLoading = false,
  onEdit,
  onDelete,
  onAssign,
  onViewDetails
}: EquipmentTableProps) {
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available':
        return 'bg-green-100 text-green-800';
      case 'assigned':
        return 'bg-blue-100 text-blue-800';
      case 'maintenance':
        return 'bg-yellow-100 text-yellow-800';
      case 'retired':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (equipment.length === 0) {
    return (
      <div className="text-center p-8 bg-gray-50 rounded-lg">
        <p className="text-gray-500">No equipment found.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full bg-white border border-gray-200 rounded-lg overflow-hidden">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Name
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Type
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Serial Number
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Location
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {equipment.map((item) => (
            <tr key={item.id} className="hover:bg-gray-50">
              <td 
                className="px-4 py-3 cursor-pointer hover:text-blue-600 font-medium"
                onClick={() => onViewDetails && onViewDetails(item)}
              >
                {item.name}
              </td>
              <td className="px-4 py-3">
                {item.type}
              </td>
              <td className="px-4 py-3">
                {item.serial_number}
              </td>
              <td className="px-4 py-3">
                {item.location}
              </td>
              <td className="px-4 py-3">
                <span 
                  className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(item.status)}`}
                >
                  {item.status}
                </span>
              </td>
              <td className="px-4 py-3 text-center">
                <div className="flex justify-center space-x-2">
                  {onViewDetails && (
                    <button
                      onClick={() => onViewDetails(item)}
                      className="text-blue-600 hover:text-blue-800"
                      title="View Details"
                    >
                      <FaInfoCircle />
                    </button>
                  )}
                  {onEdit && (
                    <button
                      onClick={() => onEdit(item)}
                      className="text-gray-600 hover:text-gray-800"
                      title="Edit Equipment"
                    >
                      <FaEdit />
                    </button>
                  )}
                  {onAssign && (
                    <button
                      onClick={() => onAssign(item)}
                      className="text-green-600 hover:text-green-800"
                      title="Assign to Technician"
                      disabled={item.status !== 'available'}
                    >
                      <FaUserCheck />
                    </button>
                  )}
                  {onDelete && (
                    <button
                      onClick={() => onDelete(item.id)}
                      className="text-red-600 hover:text-red-800"
                      title="Delete Equipment"
                    >
                      <FaTrash />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
} 