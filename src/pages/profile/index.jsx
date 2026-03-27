import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import RoleBasedNavigation from '../../components/ui/RoleBasedNavigation';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Icon from '../../components/AppIcon';
import Image from '../../components/AppImage';
import { buildApiUrl } from '../../utils/api';

const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error('Failed to read image file.'));
  reader.readAsDataURL(file);
});

const ProfilePage = () => {
  const userId = localStorage.getItem('userId');
  const userRole = localStorage.getItem('userRole') || 'customer';
  const [profile, setProfile] = useState(null);
  const [formValues, setFormValues] = useState({ fullName: '', email: '', phone: '' });
  const [avatarState, setAvatarState] = useState({
    previewUrl: '',
    dataUrl: '',
    changed: false
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!userId) {
      return;
    }
    const loadProfile = async () => {
      try {
        const response = await fetch(buildApiUrl(`/api/users/${userId}`));
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error || 'Failed to load profile');
        }
        setProfile(data);
        setFormValues({
          fullName: data?.fullName || '',
          email: data?.email || '',
          phone: data?.phone || ''
        });
        setAvatarState({
          previewUrl: data?.avatarUrl || '',
          dataUrl: '',
          changed: false
        });
      } catch (err) {
        setError(err?.message || 'Unable to load profile right now.');
      }
    };
    loadProfile();
  }, [userId]);

  const handleChange = (field, value) => {
    setFormValues((prev) => ({ ...prev, [field]: value }));
    setSuccess(false);
    setError('');
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
      setAvatarState({
        previewUrl: dataUrl,
        dataUrl,
        changed: true
      });
      setError('');
      setSuccess(false);
    } catch (err) {
      setError('Unable to read selected avatar image.');
    } finally {
      event.target.value = '';
    }
  };

  const handleRemoveAvatar = () => {
    setAvatarState({
      previewUrl: '',
      dataUrl: '',
      changed: true
    });
    setSuccess(false);
    setError('');
  };

  const handleSave = async () => {
    if (!userId) {
      return;
    }
    setIsSaving(true);
    setSuccess(false);
    setError('');
    try {
      const payload = {
        fullName: formValues?.fullName,
        email: formValues?.email,
        phone: formValues?.phone
      };
      if (avatarState?.changed) {
        payload.avatarDataUrl = avatarState?.dataUrl || '';
      }

      const response = await fetch(buildApiUrl(`/api/users/${userId}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to update profile');
      }
      const nextAvatar = data?.user?.avatarUrl !== undefined
        ? (data?.user?.avatarUrl || '')
        : (avatarState?.previewUrl || '');
      setProfile((prev) => ({
        ...prev,
        fullName: formValues?.fullName,
        email: formValues?.email,
        phone: formValues?.phone,
        avatarUrl: nextAvatar
      }));
      setAvatarState({
        previewUrl: nextAvatar,
        dataUrl: '',
        changed: false
      });
      localStorage.setItem('userName', formValues?.fullName || 'User');
      setSuccess(true);
    } catch (err) {
      setError(err?.message || 'Unable to update profile right now.');
    } finally {
      setIsSaving(false);
    }
  };

  const vehicleInfo = profile?.vehicle;

  return (
    <>
      <Helmet>
        <title>Profile - CourierFlow</title>
        <meta name="description" content="Manage your CourierFlow profile details." />
      </Helmet>
      <div className="min-h-screen bg-background">
        <RoleBasedNavigation
          userRole={userRole}
          userName={profile?.fullName || 'User'}
        />
        <main className="pt-[60px]">
          <div className="max-w-[1100px] mx-auto px-4 md:px-6 lg:px-8 py-6 md:py-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-foreground">Profile</h1>
                <p className="text-sm text-muted-foreground">View and update your details.</p>
              </div>
              <Button
                variant="default"
                iconName="Save"
                iconPosition="left"
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? 'Saving...' : 'Update'}
              </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <div className="bg-card rounded-xl shadow-elevation-md p-4 md:p-6 border border-border mb-6">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-14 h-14 rounded-full overflow-hidden bg-primary/10 flex items-center justify-center">
                      {avatarState?.previewUrl ? (
                        <Image
                          src={avatarState?.previewUrl}
                          alt={profile?.fullName ? `Profile photo of ${profile.fullName}` : 'Profile photo'}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Icon name="User" size={22} color="var(--color-primary)" />
                      )}
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-foreground">
                        {profile?.fullName || 'User'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        ID: {profile?.id || 'N/A'}
                      </p>
                    </div>
                  </div>

                  <div className="mb-6 space-y-2">
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

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                      label="Full Name"
                      value={formValues?.fullName || ''}
                      onChange={(event) => handleChange('fullName', event.target.value)}
                      placeholder="Enter full name"
                    />
                    <Input
                      label="Email"
                      type="email"
                      value={formValues?.email || ''}
                      onChange={(event) => handleChange('email', event.target.value)}
                      placeholder="you@email.com"
                    />
                    <Input
                      label="Phone"
                      value={formValues?.phone || ''}
                      onChange={(event) => handleChange('phone', event.target.value)}
                      placeholder="98xxxxxxxx"
                    />
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">Role</p>
                      <p className="text-sm text-muted-foreground capitalize">{profile?.role || userRole}</p>
                      {profile?.courierRole ? (
                        <p className="text-xs text-muted-foreground capitalize">
                          Courier Role: {profile?.courierRole}
                        </p>
                      ) : null}
                      {profile?.branchName ? (
                        <p className="text-xs text-muted-foreground">Branch: {profile?.branchName}</p>
                      ) : null}
                    </div>
                  </div>

                  {error ? (
                    <p className="text-sm text-destructive mt-4">{error}</p>
                  ) : success ? (
                    <p className="text-sm text-success mt-4">Profile updated.</p>
                  ) : null}
                </div>
              </div>

              <div className="space-y-6">
                {userRole === 'courier' ? (
                  <div className="bg-card rounded-xl shadow-elevation-md p-4 md:p-6 border border-border">
                    <h2 className="text-lg font-semibold text-foreground mb-2">Assigned Vehicle</h2>
                    {vehicleInfo ? (
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">Type</p>
                        <p className="text-sm font-medium text-foreground">{vehicleInfo?.type || 'N/A'}</p>
                        <p className="text-sm text-muted-foreground">Plate Number</p>
                        <p className="text-sm font-medium text-foreground">{vehicleInfo?.plate || 'N/A'}</p>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No vehicle assigned.</p>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </main>
      </div>
    </>
  );
};

export default ProfilePage;
