import React, { useEffect, useState } from 'react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import Select from '../../../components/ui/Select';
import { buildApiUrl } from '../../../utils/api';

const VehicleAssignmentPanel = () => {
  const [vehicles, setVehicles] = useState([]);
  const [couriers, setCouriers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingAssignments, setPendingAssignments] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState('add');
  const [formData, setFormData] = useState({
    id: null,
    code: '',
    type: '',
    plateNumber: '',
    capacityKg: '',
    status: 'active'
  });

  const statusStyles = {
    active: 'bg-success/10 text-success',
    maintenance: 'bg-warning/10 text-warning',
    inactive: 'bg-muted text-muted-foreground'
  };

  const loadVehicles = async () => {
    setIsLoading(true);
    setError('');
    try {
      const res = await fetch(buildApiUrl('/api/admin/vehicles'));
      if (!res.ok) {
        throw new Error('Failed to load vehicles');
      }
      const data = await res.json();
      setVehicles(data?.vehicles || []);
      setCouriers(data?.couriers || []);
    } catch (err) {
      setError('Unable to load vehicles right now.');
      setVehicles([]);
      setCouriers([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadVehicles();
  }, []);

  const resetForm = () => {
    setFormData({
      id: null,
      code: '',
      type: '',
      plateNumber: '',
      capacityKg: '',
      status: 'active'
    });
  };

  const startAdd = () => {
    setFormMode('add');
    resetForm();
    setShowForm(true);
  };

  const startEdit = (vehicle) => {
    setFormMode('edit');
    setFormData({
      id: vehicle?.id || null,
      code: vehicle?.code || '',
      type: vehicle?.type || '',
      plateNumber: vehicle?.plateNumber || '',
      capacityKg: vehicle?.capacityKg ?? '',
      status: vehicle?.status || 'active'
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    resetForm();
  };

  const handleFormChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveVehicle = async () => {
    setIsSaving(true);
    setError('');
    try {
      if (!formData.type || !formData.plateNumber) {
        setError('Vehicle type and plate number are required.');
        return;
      }
      if (formMode === 'add') {
        const res = await fetch(buildApiUrl('/api/admin/vehicles'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: formData.code,
            type: formData.type,
            plateNumber: formData.plateNumber,
            capacityKg: formData.capacityKg,
            status: formData.status
          })
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload?.error || 'Failed to create vehicle');
        }
        const data = await res.json();
        setVehicles((prev) => [data?.vehicle, ...prev]);
      } else if (formMode === 'edit' && formData.id) {
        const res = await fetch(buildApiUrl(`/api/admin/vehicles/${formData.id}`), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: formData.code,
            type: formData.type,
            plateNumber: formData.plateNumber,
            capacityKg: formData.capacityKg,
            status: formData.status
          })
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload?.error || 'Failed to update vehicle');
        }
        setVehicles((prev) =>
          prev.map((vehicle) =>
            vehicle.id === formData.id
              ? {
                  ...vehicle,
                  code: formData.code || vehicle.code,
                  type: formData.type,
                  plateNumber: formData.plateNumber,
                  capacityKg: formData.capacityKg === '' ? 0 : Number(formData.capacityKg),
                  status: formData.status
                }
              : vehicle
          )
        );
      }
      closeForm();
    } catch (err) {
      setError(err?.message || 'Unable to save vehicle right now.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAssign = async (vehicleId) => {
    const courierId = pendingAssignments?.[vehicleId];
    if (!courierId) return;
    setIsSaving(true);
    setError('');
    try {
      const res = await fetch(buildApiUrl(`/api/admin/vehicles/${vehicleId}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courierId })
      });
      if (!res.ok) {
        throw new Error('Failed to assign vehicle');
      }
      const courier = couriers.find((item) => item.value === courierId);
      setVehicles((prev) =>
        prev.map((vehicle) =>
          vehicle.id === vehicleId
            ? { ...vehicle, courierId: courierId, courierName: courier?.label || 'Assigned' }
            : vehicle
        )
      );
    } catch (err) {
      setError('Unable to update vehicle assignment.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUnassign = async (vehicleId) => {
    setIsSaving(true);
    setError('');
    try {
      const res = await fetch(buildApiUrl(`/api/admin/vehicles/${vehicleId}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courierId: null })
      });
      if (!res.ok) {
        throw new Error('Failed to unassign vehicle');
      }
      setVehicles((prev) =>
        prev.map((vehicle) =>
          vehicle.id === vehicleId
            ? { ...vehicle, courierId: null, courierName: null }
            : vehicle
        )
      );
    } catch (err) {
      setError('Unable to update vehicle assignment.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-card rounded-xl shadow-elevation-md border border-border overflow-hidden">
      <div className="p-4 md:p-6 border-b border-border">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <Icon name="Car" size={20} color="var(--color-primary)" />
            </div>
            <div>
              <h2 className="text-lg md:text-xl font-semibold text-foreground">Vehicle Assignments</h2>
              <p className="text-xs md:text-sm text-muted-foreground">Manage courier vehicle allocation</p>
            </div>
          </div>
          <Button variant="outline" size="sm" iconName="Plus" iconPosition="left" onClick={startAdd}>
            Add Vehicle
          </Button>
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-4 rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}
      {showForm && (
        <div className="mx-4 mt-4 rounded-lg border border-border bg-muted/30 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">
              {formMode === 'edit' ? 'Edit Vehicle' : 'Add Vehicle'}
            </h3>
            <Button variant="ghost" size="sm" iconName="X" onClick={closeForm}>
              Close
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input
              type="text"
              placeholder="Vehicle code (optional)"
              value={formData.code}
              onChange={(e) => handleFormChange('code', e?.target?.value)}
            />
            <Input
              type="text"
              placeholder="Vehicle type (e.g., bike, van)"
              value={formData.type}
              onChange={(e) => handleFormChange('type', e?.target?.value)}
            />
            <Input
              type="text"
              placeholder="Plate number"
              value={formData.plateNumber}
              onChange={(e) => handleFormChange('plateNumber', e?.target?.value)}
            />
            <Input
              type="number"
              placeholder="Capacity (kg)"
              value={formData.capacityKg}
              onChange={(e) => handleFormChange('capacityKg', e?.target?.value)}
            />
            <Select
              options={[
                { value: 'active', label: 'Active' },
                { value: 'maintenance', label: 'Maintenance' },
                { value: 'inactive', label: 'Inactive' }
              ]}
              value={formData.status}
              onChange={(value) => handleFormChange('status', value)}
              placeholder="Select status"
            />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Button variant="default" size="sm" onClick={handleSaveVehicle} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save Vehicle'}
            </Button>
            <Button variant="outline" size="sm" onClick={closeForm} disabled={isSaving}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {isLoading && (
        <div className="py-10 text-center text-sm text-muted-foreground">
          Loading vehicles...
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead className="bg-muted/40">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Vehicle</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Capacity</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Assigned Courier</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Action</th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map((vehicle) => (
              <tr key={vehicle.id} className="border-t border-border">
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
                      <Icon name="Truck" size={18} className="text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{vehicle.type}</p>
                      <p className="text-xs text-muted-foreground">{vehicle.plateNumber}</p>
                      <p className="text-xs text-muted-foreground">{vehicle.code || 'No code'}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4 text-sm text-foreground">{vehicle.capacityKg ? `${vehicle.capacityKg} kg` : 'N/A'}</td>
                <td className="px-4 py-4">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusStyles?.[vehicle.status] || statusStyles.inactive}`}>
                    {vehicle.status}
                  </span>
                </td>
                <td className="px-4 py-4">
                  {vehicle.courierName ? (
                    <div className="flex items-center gap-2">
                      <Icon name="User" size={16} className="text-muted-foreground" />
                      <span className="text-sm text-foreground">{vehicle.courierName}</span>
                    </div>
                  ) : (
                    <Select
                      options={couriers}
                      value={pendingAssignments?.[vehicle.id] || ''}
                      onChange={(value) =>
                        setPendingAssignments((prev) => ({ ...prev, [vehicle.id]: value }))
                      }
                      placeholder="Select courier"
                      className="min-w-[180px]"
                    />
                  )}
                </td>
                <td className="px-4 py-4">
                  {vehicle.courierName ? (
                    <Button
                      variant="outline"
                      size="sm"
                      iconName="UserMinus"
                      iconPosition="left"
                      onClick={() => handleUnassign(vehicle.id)}
                      disabled={isSaving}
                    >
                      Unassign
                    </Button>
                  ) : (
                    <Button
                      variant="default"
                      size="sm"
                      iconName="UserPlus"
                      iconPosition="left"
                      onClick={() => handleAssign(vehicle.id)}
                      disabled={!pendingAssignments?.[vehicle.id] || isSaving}
                    >
                      Assign
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    iconName="Edit"
                    onClick={() => startEdit(vehicle)}
                    disabled={isSaving}
                    className="ml-2"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!isLoading && vehicles.length === 0 && (
        <div className="py-10 text-center text-sm text-muted-foreground">
          No vehicles available.
        </div>
      )}
    </div>
  );
};

export default VehicleAssignmentPanel;
