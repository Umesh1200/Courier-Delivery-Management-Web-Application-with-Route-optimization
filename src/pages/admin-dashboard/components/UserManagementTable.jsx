import React, { useEffect, useState } from 'react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import Select from '../../../components/ui/Select';
import Image from '../../../components/AppImage';
import { buildApiUrl } from '../../../utils/api';

const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error('Failed to read image file.'));
  reader.readAsDataURL(file);
});

const UserManagementTable = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [users, setUsers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [formMode, setFormMode] = useState(null);
  const [formData, setFormData] = useState({
    id: null,
    fullName: '',
    email: '',
    phone: '',
    role: 'customer',
    courierRole: 'both',
    branchId: '',
    status: 'active',
    password: '',
    avatarUrl: '',
    avatarDataUrl: '',
    avatarChanged: false
  });
  const [isSaving, setIsSaving] = useState(false);
  const [detailUser, setDetailUser] = useState(null);

  const formatDate = (value) => {
    if (!value) {
      return 'N/A';
    }
    const date = new Date(value);
    if (Number.isNaN(date?.getTime())) {
      return value;
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatTimeAgo = (value) => {
    if (!value) {
      return 'N/A';
    }
    const date = new Date(value);
    if (Number.isNaN(date?.getTime())) {
      return value;
    }
    const diffMs = Date.now() - date.getTime();
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) {
      return 'Just now';
    }
    if (minutes < 60) {
      return `${minutes} min ago`;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    }
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  };

  const mapApiUser = (user) => ({
    id: user?.id,
    name: user?.fullName,
    email: user?.email,
    phone: user?.phone || '',
    avatar: user?.avatarUrl || '',
    avatarAlt: user?.fullName ? `Profile photo of ${user?.fullName}` : 'Profile photo',
    role: user?.role || 'customer',
    courierRole: user?.courierRole || null,
    branchId: user?.branchId || null,
    branchName: user?.branchName || null,
    status: user?.status || 'active',
    joinDate: formatDate(user?.createdAt),
    totalOrders: user?.totalOrders || 0,
    lastActive: formatTimeAgo(user?.updatedAt),
    createdAt: user?.createdAt,
    updatedAt: user?.updatedAt
  });

  const loadUsers = async () => {
    setIsLoading(true);
    setError('');
    try {
      const res = await fetch(buildApiUrl('/api/admin/users'));
      if (!res.ok) {
        throw new Error('Failed to load users');
      }
      const data = await res.json();
      const mapped = (data?.users || []).map(mapApiUser);
      setUsers(mapped);
    } catch (err) {
      setError('Unable to load users right now.');
      setUsers([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const loadBranches = async () => {
    try {
      const res = await fetch(buildApiUrl('/api/admin/branches'));
      if (!res.ok) {
        throw new Error('Failed to load branches');
      }
      const data = await res.json();
      setBranches(data?.branches || []);
    } catch (err) {
      setBranches([]);
    }
  };

  useEffect(() => {
    loadBranches();
  }, []);


  const roleOptions = [
  { value: 'all', label: 'All Roles' },
  { value: 'customer', label: 'Customer' },
  { value: 'courier', label: 'Courier' },
  { value: 'admin', label: 'Admin' }];


  const statusOptions = [
  { value: 'all', label: 'All Status' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'suspended', label: 'Suspended' }];

  const formRoleOptions = roleOptions?.filter((option) => option?.value !== 'all');
  const formStatusOptions = statusOptions?.filter((option) => option?.value !== 'all');


  const getRoleConfig = (role) => {
    const configs = {
      'customer': { label: 'Customer', color: 'var(--color-primary)', bg: 'bg-primary/10', icon: 'User' },
      'courier': { label: 'Courier', color: 'var(--color-accent)', bg: 'bg-accent/10', icon: 'Truck' },
      'admin': { label: 'Admin', color: 'var(--color-secondary)', bg: 'bg-secondary/10', icon: 'Shield' }
    };
    return configs?.[role] || configs?.['customer'];
  };

  const getStatusConfig = (status) => {
    const configs = {
      'active': { label: 'Active', color: 'var(--color-success)', bg: 'bg-success/10' },
      'inactive': { label: 'Inactive', color: 'var(--color-muted-foreground)', bg: 'bg-muted' },
      'suspended': { label: 'Suspended', color: 'var(--color-error)', bg: 'bg-error/10' },
      'banned': { label: 'Suspended', color: 'var(--color-error)', bg: 'bg-error/10' }
    };
    return configs?.[status] || configs?.['active'];
  };

  const resetForm = () => {
    setFormData({
      id: null,
      fullName: '',
      email: '',
      phone: '',
      role: 'customer',
      courierRole: 'both',
      branchId: '',
      status: 'active',
      password: '',
      avatarUrl: '',
      avatarDataUrl: '',
      avatarChanged: false
    });
  };

  const startAdd = () => {
    setFormMode('add');
    resetForm();
    setDetailUser(null);
  };

  const startEdit = (user) => {
    setFormMode('edit');
    setFormData({
      id: user?.id,
      fullName: user?.name || '',
      email: user?.email || '',
      phone: user?.phone || '',
      role: user?.role || 'customer',
      courierRole: user?.courierRole || 'both',
      branchId: user?.branchId || '',
      status: user?.status || 'active',
      password: '',
      avatarUrl: user?.avatar || '',
      avatarDataUrl: '',
      avatarChanged: false
    });
    setDetailUser(null);
  };

  const closeForm = () => {
    setFormMode(null);
    resetForm();
  };

  const handleFormChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleAvatarFileChange = async (event) => {
    const file = event?.target?.files?.[0];
    if (!file) {
      return;
    }
    if (!file.type?.startsWith('image/')) {
      setError('Please choose an image file for avatar.');
      event.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Avatar image must be 5MB or smaller.');
      event.target.value = '';
      return;
    }

    try {
      const dataUrl = await fileToDataUrl(file);
      setFormData((prev) => ({
        ...prev,
        avatarUrl: dataUrl,
        avatarDataUrl: dataUrl,
        avatarChanged: true
      }));
      setError('');
    } catch (err) {
      setError('Unable to read selected avatar image.');
    } finally {
      event.target.value = '';
    }
  };

  const handleRemoveAvatar = () => {
    setFormData((prev) => ({
      ...prev,
      avatarUrl: '',
      avatarDataUrl: '',
      avatarChanged: true
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setError('');
    try {
      const avatarPayload = formData?.avatarChanged
        ? { avatarDataUrl: formData?.avatarDataUrl || '' }
        : {};
      if (formMode === 'add') {
        if (!formData?.password) {
          setError('Temporary password is required for new users.');
          return;
        }
        const res = await fetch(buildApiUrl('/api/admin/users'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fullName: formData?.fullName,
            email: formData?.email,
            phone: formData?.phone,
            role: formData?.role,
            courierRole: formData?.role === 'courier' ? formData?.courierRole : undefined,
            branchId: formData?.role === 'courier' && formData?.branchId ? Number(formData?.branchId) : null,
            status: formData?.status,
            password: formData?.password,
            ...avatarPayload
          })
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload?.error || 'Failed to create user');
        }
        const data = await res.json();
        setUsers((prev) => [mapApiUser({ ...data?.user, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), totalOrders: 0 }), ...prev]);
        closeForm();
      } else if (formMode === 'edit' && formData?.id) {
        const res = await fetch(buildApiUrl(`/api/admin/users/${formData?.id}`), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fullName: formData?.fullName,
            email: formData?.email,
            phone: formData?.phone,
            role: formData?.role,
            courierRole: formData?.role === 'courier' ? formData?.courierRole : undefined,
            branchId: formData?.role === 'courier' ? (formData?.branchId ? Number(formData?.branchId) : null) : null,
            status: formData?.status,
            ...avatarPayload
          })
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload?.error || 'Failed to update user');
        }
        const updatedAt = new Date().toISOString();
        setUsers((prev) =>
          prev.map((user) =>
            user?.id === formData?.id
              ? {
                  ...user,
                  name: formData?.fullName,
                  email: formData?.email,
                  phone: formData?.phone,
                  role: formData?.role,
                  courierRole: formData?.role === 'courier' ? formData?.courierRole : null,
                  branchId: formData?.role === 'courier' ? (formData?.branchId ? Number(formData?.branchId) : null) : null,
                  branchName: formData?.role === 'courier'
                    ? (branches.find((branch) => branch.id === Number(formData?.branchId))?.name || null)
                    : null,
                  status: formData?.status,
                  avatar: formData?.avatarChanged ? (formData?.avatarDataUrl || '') : user?.avatar,
                  avatarAlt: formData?.fullName ? `Profile photo of ${formData?.fullName}` : user?.avatarAlt,
                  updatedAt,
                  lastActive: formatTimeAgo(updatedAt)
                }
              : user
          )
        );
        closeForm();
      }
    } catch (err) {
      setError(err?.message || 'Unable to save user changes right now.');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleStatus = async (user) => {
    const nextStatus = user?.status === 'active' ? 'suspended' : 'active';
    const confirmAction = window.confirm(`Set ${user?.name} to ${nextStatus}?`);
    if (!confirmAction) {
      return;
    }
    setIsSaving(true);
    setError('');
    try {
      const res = await fetch(buildApiUrl(`/api/admin/users/${user?.id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus })
      });
      if (!res.ok) {
        throw new Error('Failed to update status');
      }
      const updatedAt = new Date().toISOString();
      setUsers((prev) =>
        prev.map((row) =>
          row?.id === user?.id
            ? { ...row, status: nextStatus, updatedAt, lastActive: formatTimeAgo(updatedAt) }
            : row
        )
      );
    } catch (err) {
      setError('Unable to update user status right now.');
    } finally {
      setIsSaving(false);
    }
  };

  const filteredUsers = users?.filter((user) => {
    const matchesSearch = user?.name?.toLowerCase()?.includes(searchQuery?.toLowerCase()) ||
    user?.email?.toLowerCase()?.includes(searchQuery?.toLowerCase());
    const matchesRole = roleFilter === 'all' || user?.role === roleFilter;
    const matchesStatus = statusFilter === 'all' || user?.status === statusFilter;
    return matchesSearch && matchesRole && matchesStatus;
  });

  return (
    <div className="bg-card rounded-xl p-4 md:p-6 shadow-elevation-sm">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-1">User Management</h3>
          <p className="text-sm text-muted-foreground">Manage platform users and permissions</p>
        </div>
        
        <Button
          variant="default"
          iconName="UserPlus"
          iconPosition="left"
          onClick={() => (formMode === 'add' ? closeForm() : startAdd())}
        >
          Add User
        </Button>
      </div>
      {error && (
        <div className="mb-4 rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}
      {detailUser && (
        <div className="mb-6 rounded-lg border border-border bg-muted/20 p-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-foreground">{detailUser?.name}</p>
              <p className="text-xs text-muted-foreground">{detailUser?.email}</p>
              <p className="text-xs text-muted-foreground">{detailUser?.phone || 'No phone on file'}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => startEdit(detailUser)}>
                Edit User
              </Button>
              <Button variant="ghost" size="sm" iconName="X" onClick={() => setDetailUser(null)}>
                Close
              </Button>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-muted-foreground">
            <div>Role: <span className="text-foreground font-medium">{detailUser?.role}</span></div>
            {detailUser?.role === 'courier' && (
              <>
                <div>Courier Role: <span className="text-foreground font-medium">{detailUser?.courierRole || 'both'}</span></div>
                <div>Branch: <span className="text-foreground font-medium">{detailUser?.branchName || 'Unassigned'}</span></div>
              </>
            )}
            <div>Status: <span className="text-foreground font-medium">{detailUser?.status}</span></div>
            <div>Last Active: <span className="text-foreground font-medium">{detailUser?.lastActive}</span></div>
            <div>Joined: <span className="text-foreground font-medium">{detailUser?.joinDate}</span></div>
            <div>Total Orders: <span className="text-foreground font-medium">{detailUser?.totalOrders}</span></div>
          </div>
        </div>
      )}
      {formMode && (
        <form onSubmit={handleSubmit} className="mb-6 rounded-lg border border-border bg-muted/20 p-4">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-semibold text-foreground">
              {formMode === 'add' ? 'Add New User' : 'Edit User'}
            </h4>
            <Button variant="ghost" size="sm" iconName="X" onClick={closeForm}>
              Close
            </Button>
          </div>
          <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="w-16 h-16 rounded-full overflow-hidden border border-border bg-background flex items-center justify-center">
              {formData?.avatarUrl ? (
                <Image
                  src={formData?.avatarUrl}
                  alt={formData?.fullName ? `Profile photo of ${formData.fullName}` : 'Profile photo'}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Icon name="User" size={20} className="text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 space-y-2">
              <Input
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                onChange={handleAvatarFileChange}
              />
              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={handleRemoveAvatar}>
                  Remove Avatar
                </Button>
                <span className="text-xs text-muted-foreground">PNG/JPG/WEBP, max 5MB</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input
              type="text"
              placeholder="Full name"
              value={formData?.fullName}
              onChange={(e) => handleFormChange('fullName', e?.target?.value)}
            />
            <Input
              type="email"
              placeholder="Email address"
              value={formData?.email}
              onChange={(e) => handleFormChange('email', e?.target?.value)}
            />
            <Input
              type="tel"
              placeholder="Phone number"
              value={formData?.phone}
              onChange={(e) => handleFormChange('phone', e?.target?.value)}
            />
            <Select
              options={formRoleOptions}
              value={formData?.role}
              onChange={(value) => handleFormChange('role', value)}
              placeholder="Select role"
            />
            {formData?.role === 'courier' && (
              <Select
                options={[
                  { value: 'pickup', label: 'Pickup' },
                  { value: 'delivery', label: 'Delivery' },
                  { value: 'both', label: 'Both' },
                  { value: 'linehaul', label: 'Linehaul' },
                  { value: 'express', label: 'Express' }
                ]}
                value={formData?.courierRole}
                onChange={(value) => handleFormChange('courierRole', value)}
                placeholder="Courier role"
              />
            )}
            {formData?.role === 'courier' && (
              <Select
                options={branches.map((branch) => ({
                  value: branch.id,
                  label: branch.name
                }))}
                value={formData?.branchId}
                onChange={(value) => handleFormChange('branchId', value)}
                placeholder="Assign branch"
              />
            )}
            <Select
              options={formStatusOptions}
              value={formData?.status}
              onChange={(value) => handleFormChange('status', value)}
              placeholder="Select status"
            />
            {formMode === 'add' && (
              <Input
                type="password"
                placeholder="Temporary password"
                value={formData?.password}
                onChange={(e) => handleFormChange('password', e?.target?.value)}
              />
            )}
          </div>
          <div className="mt-4 flex items-center gap-2">
            <Button type="submit" variant="default" disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save User'}
            </Button>
            <Button type="button" variant="outline" onClick={closeForm} disabled={isSaving}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <Input
          type="search"
          placeholder="Search users..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e?.target?.value)}
          className="md:col-span-1" />

        <Select
          options={roleOptions}
          value={roleFilter}
          onChange={setRoleFilter}
          placeholder="Filter by role" />

        <Select
          options={statusOptions}
          value={statusFilter}
          onChange={setStatusFilter}
          placeholder="Filter by status" />

      </div>
      {isLoading && (
        <div className="py-10 text-center text-sm text-muted-foreground">
          Loading users...
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-4 text-sm font-semibold text-foreground">User</th>
              <th className="text-left py-3 px-4 text-sm font-semibold text-foreground hidden lg:table-cell">Role</th>
              <th className="text-left py-3 px-4 text-sm font-semibold text-foreground hidden md:table-cell">Status</th>
              <th className="text-left py-3 px-4 text-sm font-semibold text-foreground hidden xl:table-cell">Join Date</th>
              <th className="text-left py-3 px-4 text-sm font-semibold text-foreground hidden lg:table-cell">Orders</th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers?.map((user) => {
              const roleConfig = getRoleConfig(user?.role);
              const statusConfig = getStatusConfig(user?.status);

              return (
                <tr key={user?.id} className="border-b border-border hover:bg-muted/30 transition-smooth">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 border border-border bg-background flex items-center justify-center">
                        {user?.avatar ? (
                          <Image
                            src={user?.avatar}
                            alt={user?.avatarAlt}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Icon name="User" size={16} className="text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground line-clamp-1">{user?.name}</p>
                        <p className="text-xs text-muted-foreground line-clamp-1">{user?.email}</p>
                        <p className="text-xs text-muted-foreground line-clamp-1">{user?.phone || 'No phone'}</p>
                        {user?.role === 'courier' && (
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {user?.branchName ? `Branch: ${user?.branchName}` : 'Branch: Unassigned'}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 hidden lg:table-cell">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${roleConfig?.bg}`}>
                        <Icon name={roleConfig?.icon} size={14} color={roleConfig?.color} />
                      </div>
                      <span className="text-sm font-medium" style={{ color: roleConfig?.color }}>
                        {roleConfig?.label}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4 hidden md:table-cell">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusConfig?.bg}`}
                      style={{ color: statusConfig?.color }}>

                      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusConfig?.color }}></div>
                      {statusConfig?.label}
                    </span>
                  </td>
                  <td className="py-3 px-4 hidden xl:table-cell">
                    <p className="text-sm text-muted-foreground">{user?.joinDate}</p>
                  </td>
                  <td className="py-3 px-4 hidden lg:table-cell">
                    <p className="text-sm font-medium text-foreground">{user?.totalOrders}</p>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        iconName="Eye"
                        onClick={() => setDetailUser(user)}
                        disabled={isSaving}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        iconName="Edit"
                        onClick={() => startEdit(user)}
                        disabled={isSaving}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        iconName="MoreVertical"
                        onClick={() => toggleStatus(user)}
                        disabled={isSaving}
                      />
                    </div>
                  </td>
                </tr>);

            })}
          </tbody>
        </table>
      </div>
      {!isLoading && filteredUsers?.length === 0 &&
      <div className="py-12 text-center">
          <Icon name="Users" size={48} className="mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No users found matching your criteria</p>
        </div>
      }
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 pt-6 border-t border-border">
        <p className="text-sm text-muted-foreground">
          Showing {filteredUsers?.length} of {users?.length} users
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" iconName="ChevronLeft" disabled />
          <Button variant="outline" size="sm">1</Button>
          <Button variant="ghost" size="sm">2</Button>
          <Button variant="ghost" size="sm">3</Button>
          <Button variant="outline" size="sm" iconName="ChevronRight" />
        </div>
      </div>
    </div>);

};

export default UserManagementTable;
