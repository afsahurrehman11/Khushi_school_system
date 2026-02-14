import React, { useEffect, useState } from 'react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import { feeCategoriesApi } from '../services/feeApi';
import { InAppNotificationService } from '../services/InAppNotificationService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const FeeCategoryModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [formErrors, setFormErrors] = useState<{ name?: string; components?: string }>({});
  const [form, setForm] = useState({ name: '', description: '', components: [{ component_name: '', amount: undefined as string | undefined }] });

  const load = async () => {
    setLoading(true);
    try {
      const data = await feeCategoriesApi.getAllCategories();
      setCategories(Array.isArray(data) ? data : []);
    } catch (err) {
      InAppNotificationService.error('Failed to load categories');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen]);

  const resetForm = () => {
    setForm({ name: '', description: '', components: [{ component_name: '', amount: undefined }] });
    setFormErrors({});
  };

  const handleSave = async () => {
    // Basic client-side validation
    const errors: any = {};
    if (!form.name || form.name.trim() === '') {
      errors.name = 'Name required';
    }

    const invalidComponents = form.components.filter((c: any) => !c.component_name || c.component_name.trim() === '' || c.amount === undefined || c.amount === '' || isNaN(parseFloat(c.amount)) || parseFloat(c.amount) < 0);
    if (invalidComponents.length > 0) {
      errors.components = 'Invalid components';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setFormErrors({});
    setSaving(true);
    try {
      if (editing) {
        await feeCategoriesApi.updateCategory(editing.id, { ...form, components: form.components.map(c => ({ ...c, amount: parseFloat(c.amount) })) });
        InAppNotificationService.success('Category updated');
      } else {
        await feeCategoriesApi.createCategory({ ...form, components: form.components.map(c => ({ ...c, amount: parseFloat(c.amount) })) });
        InAppNotificationService.success('Category created');
      }
      await load();
      resetForm();
      setEditing(null);
    } catch (err) {
      InAppNotificationService.error('Failed to save category');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (cat: any) => {
    setEditing(cat);
    setForm({ name: cat.name, description: cat.description || '', components: cat.components?.map((c: any) => ({ component_name: c.component_name, amount: c.amount.toString() })) || [{ component_name: '', amount: '' }] });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this category?')) return;
    try {
      await feeCategoriesApi.deleteCategory(id);
      InAppNotificationService.success('Category deleted');
      await load();
    } catch (err) {
      InAppNotificationService.error('Failed to delete');
    }
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title="Fee Categories" size="lg">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm text-secondary-700">Fee Categories</h3>
              <div className="text-xs text-secondary-500">Manage categories</div>
            </div>
          </div>

          <div className="space-y-6">
            {/* Create/Edit Form First */}
            <div className="bg-white rounded p-4 border">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold">Name</label>
                  <input placeholder="e.g. Monthly Tuition" value={form.name} onChange={e => { setForm(prev => ({ ...prev, name: e.target.value })); if (formErrors.name) setFormErrors(prev => ({ ...prev, name: undefined })); }} className="w-full px-3 py-2 border rounded" />
                  {formErrors?.name && <div className="text-xs text-red-500 mt-1">{formErrors?.name}</div>}
                </div>

                <div>
                  <label className="block text-sm font-semibold">Description</label>
                  <textarea placeholder="Optional description..." value={form.description} onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))} className="w-full px-3 py-2 border rounded" />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-semibold">Components</div>
                    <Button variant="ghost" onClick={() => setForm(prev => ({ ...prev, components: [...prev.components, { component_name: '', amount: '' }] }))}>Add Component</Button>
                  </div>

                  <div className="space-y-3 max-h-64 overflow-auto">
                    {form.components.map((c, i) => (
                      <div key={i} className="p-3 border rounded bg-secondary-50">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-sm font-medium">Component #{i + 1}</div>
                          <div className="flex gap-2">
                            <Button variant="ghost" onClick={() => setForm(prev => ({ ...prev, components: prev.components.filter((_, idx) => idx !== i) }))}>Remove</Button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs text-secondary-600">Attribute</label>
                            <input placeholder="e.g. Tuition, Lab Fee" value={c.component_name} onChange={e => { setForm(prev => ({ ...prev, components: prev.components.map((m, idx) => idx === i ? { ...m, component_name: e.target.value } : m) })); if (formErrors.components) setFormErrors(prev => ({ ...prev, components: undefined })); }} className="w-full px-2 py-2 border rounded" />
                          </div>
                          <div>
                            <label className="block text-xs text-secondary-600">Amount (PKR)</label>
                            <input type="number" placeholder="" value={c.amount || ''} onChange={e => { setForm(prev => ({ ...prev, components: prev.components.map((m, idx) => idx === i ? { ...m, amount: e.target.value } : m) })); if (formErrors.components) setFormErrors(prev => ({ ...prev, components: undefined })); }} className="w-full px-2 py-2 border rounded" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {formErrors?.components && <div className="text-xs text-red-500 mt-1">{formErrors?.components}</div>}
                </div>
                <div className="flex justify-end">
                  <Button variant="primary" onClick={handleSave} disabled={saving}>
                    {saving ? (
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-t-transparent border-white rounded-full animate-spin" />
                        <span>{editing ? 'Updating...' : 'Saving...'}</span>
                      </div>
                    ) : (editing ? 'Update Category' : 'Create Category')}
                  </Button>
                </div>
              </div>
            </div>

            {/* Existing Categories List */}
            <div className="bg-white rounded p-4 border max-h-96 overflow-auto">
              <div className="text-sm font-semibold mb-3">Existing Categories</div>
              {loading ? <div>Loading...</div> : (
                categories.length === 0 ? <div className="text-sm text-secondary-500">No categories found</div> : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {categories.map(cat => (
                      <div key={cat.id} className="p-3 border rounded hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="font-medium text-sm">{cat.name}</div>
                            <div className="text-xs text-secondary-500 mt-1">Rs. {cat.total_amount}</div>
                            {cat.description && <div className="text-xs text-secondary-400 mt-1">{cat.description}</div>}
                          </div>
                          <div className="flex flex-col gap-1 ml-2">
                            <Button variant="ghost" size="sm" onClick={() => handleEdit(cat)}>Edit</Button>
                            <Button variant="danger" size="sm" onClick={() => handleDelete(cat.id)}>Delete</Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default FeeCategoryModal;
