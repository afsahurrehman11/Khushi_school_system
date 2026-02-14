import React, { useEffect, useState } from 'react';
import { Receipt } from 'lucide-react';
import Button from '../../../components/Button';
import ChalanCard from '../components/ChalanCard';
import AddChalanModal from '../components/AddChalanModal';
import { getChalans, deleteChalan } from '../services/chalansApi';

const ChalanList: React.FC = () => {
  const [chalans, setChalans] = useState<any[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editChalan, setEditChalan] = useState<any | null>(null);

  const load = async () => {
    try {
      const data = await getChalans();
      setChalans(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load chalans', err);
      setChalans([]);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this chalan?')) return;
    
    try {
      await deleteChalan(id);
      await load();
    } catch (err: any) {
      console.error('Failed to delete chalan', err);
      alert('Delete failed: ' + (err?.message || err));
    }
  };

  return (
    <div className="min-h-screen p-8 bg-secondary-50">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Chalans</h1>
            <p className="text-secondary-600">Manage fee vouchers and payment slips</p>
          </div>
          <Button
            variant="primary"
            onClick={() => {
              setEditChalan(null);
              setAddOpen(true);
            }}
          >
            <Receipt className="w-4 h-4 mr-2" /> Add Chalan
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {chalans.map((c) => (
            <ChalanCard
              key={c.id || c._id}
              {...c}
              onEdit={() => {
                setEditChalan(c);
                setAddOpen(true);
              }}
              onDelete={() => handleDelete(c.id || c._id)}
            />
          ))}
        </div>

        {chalans.length === 0 && (
          <div className="text-center py-12 text-secondary-500">
            <Receipt className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No chalans found. Create your first chalan to get started.</p>
          </div>
        )}
      </div>

      <AddChalanModal
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        chalan={editChalan}
        onSaved={() => load()}
      />
    </div>
  );
};

export default ChalanList;
