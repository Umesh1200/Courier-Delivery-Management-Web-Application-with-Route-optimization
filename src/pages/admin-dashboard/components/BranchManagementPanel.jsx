import React, { useEffect, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import { buildApiUrl } from '../../../utils/api';

const BranchManagementPanel = () => {
  const geoapifyKey = 'b2753bad7f63400ba6e69b971f16fe4e';

  const emptyForm = {
    id: '',
    name: '',
    contactName: '',
    contactPhone: '',
    contactEmail: '',
    addressLine: '',
    city: '',
    province: '',
    postalCode: '',
    lat: '',
    lng: '',
    status: 'active'
  };

  const [branches, setBranches] = useState([]);
  const [formData, setFormData] = useState(emptyForm);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoadingAddress, setIsLoadingAddress] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const mapLat = Number(formData.lat || 40.7128);
  const mapLng = Number(formData.lng || -74.0060);
  const mapCenter = [mapLat, mapLng];

  const markerIcon = L.icon({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41]
  });

  const statusStyles = {
    active: 'bg-success/10 text-success',
    maintenance: 'bg-warning/10 text-warning',
    inactive: 'bg-muted text-muted-foreground'
  };

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const composeAddress = (branch) => (
    `${branch.addressLine}, ${branch.city}, ${branch.province} ${branch.postalCode}`.trim()
  );

  const handleEdit = (branch) => {
    setFormData({
      id: branch.id,
      name: branch.name,
      contactName: branch.contactName,
      contactPhone: branch.contactPhone,
      contactEmail: branch.contactEmail,
      addressLine: branch.addressLine || '',
      city: branch.city || '',
      province: branch.province || '',
      postalCode: branch.postalCode || '',
      lat: branch.lat ?? '',
      lng: branch.lng ?? '',
      status: branch.status || 'active'
    });
    setIsEditing(true);
    setShowForm(true);
  };

  const handleCancel = () => {
    setFormData(emptyForm);
    setIsEditing(false);
    setLocationError('');
    setShowForm(false);
    setSearchQuery('');
  };

  const handleSave = async () => {
    const composedAddress = `${formData.addressLine}, ${formData.city}, ${formData.province} ${formData.postalCode}`.trim();
    setIsSaving(true);
    setError('');
    try {
      if (isEditing) {
        const res = await fetch(buildApiUrl(`/api/admin/branches/${formData.id}`), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formData.name,
            contactName: formData.contactName,
            contactPhone: formData.contactPhone,
            contactEmail: formData.contactEmail,
            addressLine: formData.addressLine,
            city: formData.city,
            province: formData.province,
            postalCode: formData.postalCode,
            lat: Number(formData.lat),
            lng: Number(formData.lng),
            status: formData.status
          })
        });
        if (!res.ok) {
          throw new Error('Failed to update branch');
        }
        setBranches((prev) =>
          prev.map((branch) =>
            branch.id === formData.id
              ? {
                  ...branch,
                  name: formData.name,
                  addressLine: formData.addressLine,
                  city: formData.city,
                  province: formData.province,
                  postalCode: formData.postalCode,
                  contactName: formData.contactName,
                  contactPhone: formData.contactPhone,
                  contactEmail: formData.contactEmail,
                  lat: Number(formData.lat),
                  lng: Number(formData.lng),
                  status: formData.status
                }
              : branch
          )
        );
      } else {
        const res = await fetch(buildApiUrl('/api/admin/branches'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formData.name,
            contactName: formData.contactName,
            contactPhone: formData.contactPhone,
            contactEmail: formData.contactEmail,
            addressLine: formData.addressLine,
            city: formData.city,
            province: formData.province,
            postalCode: formData.postalCode,
            lat: Number(formData.lat),
            lng: Number(formData.lng),
            status: formData.status
          })
        });
        if (!res.ok) {
          throw new Error('Failed to create branch');
        }
        const data = await res.json();
        const newBranch = {
          ...data?.branch,
          addressLine: data?.branch?.addressLine,
          city: data?.branch?.city,
          province: data?.branch?.province,
          postalCode: data?.branch?.postalCode
        };
        setBranches((prev) => [newBranch, ...prev]);
      }
      handleCancel();
    } catch (err) {
      setError('Unable to save branch right now.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReverseGeocode = async (lat, lng) => {
    setLocationError('');
    setIsLoadingAddress(true);
    try {
      const response = await fetch(
        `https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${lng}&format=json&apiKey=${geoapifyKey}`
      );
      const data = await response.json();
      const result = data?.results?.[0];
      if (!result) {
        setLocationError('No address found for these coordinates.');
        return;
      }
      setFormData((prev) => ({
        ...prev,
        lat,
        lng,
        addressLine: result?.address_line1 || prev.addressLine,
        city: result?.city || result?.county || prev.city,
        province: result?.state || prev.province,
        postalCode: result?.postcode || prev.postalCode
      }));
    } catch (error) {
      setLocationError('Failed to fetch address. Please try again.');
    } finally {
      setIsLoadingAddress(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery) {
      setLocationError('Enter a location to search.');
      return;
    }
    setLocationError('');
    setIsLoadingAddress(true);
    try {
      const response = await fetch(
        `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(searchQuery)}&format=json&apiKey=${geoapifyKey}`
      );
      const data = await response.json();
      const result = data?.results?.[0];
      if (!result) {
        setLocationError('No results found for this search.');
        return;
      }
      setFormData((prev) => ({
        ...prev,
        lat: result.lat,
        lng: result.lon,
        addressLine: result.address_line1 || prev.addressLine,
        city: result?.city || result?.county || prev.city,
        province: result?.state || prev.province,
        postalCode: result?.postcode || prev.postalCode
      }));
    } catch (error) {
      setLocationError('Search failed. Please try again.');
    } finally {
      setIsLoadingAddress(false);
    }
  };

  const MapClickHandler = () => {
    useMapEvents({
      click(event) {
        handleReverseGeocode(event.latlng.lat, event.latlng.lng);
      }
    });
    return null;
  };

  const loadBranches = async () => {
    setIsLoading(true);
    setError('');
    try {
      const res = await fetch(buildApiUrl('/api/admin/branches'));
      if (!res.ok) {
        throw new Error('Failed to load branches');
      }
      const data = await res.json();
      setBranches(data?.branches || []);
    } catch (err) {
      setError('Unable to load branches right now.');
      setBranches([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBranches();
  }, []);

  return (
    <div className="bg-card rounded-xl shadow-elevation-md border border-border overflow-hidden">
      <div className="p-4 md:p-6 border-b border-border">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center">
              <Icon name="MapPin" size={20} color="var(--color-accent)" />
            </div>
            <div>
              <h2 className="text-lg md:text-xl font-semibold text-foreground">Branch Management</h2>
              <p className="text-xs md:text-sm text-muted-foreground">Manage courier branch locations and contacts</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            iconName="Plus"
            iconPosition="left"
            onClick={() => setShowForm(true)}
          >
            Add Branch
          </Button>
        </div>
      </div>

      <div className="p-4 md:p-6">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2">
            {error && (
              <div className="mb-4 rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
                {error}
              </div>
            )}
            {isLoading && (
              <div className="py-10 text-center text-sm text-muted-foreground">
                Loading branches...
              </div>
            )}
            <div className="overflow-x-auto border border-border rounded-lg">
              <table className="w-full min-w-[720px]">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Branch</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Address</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Contact</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {branches.map((branch) => (
                    <tr key={branch.id} className="border-t border-border">
                      <td className="px-4 py-4">
                        <p className="text-sm font-semibold text-foreground">{branch.name}</p>
                        <p className="text-xs text-muted-foreground">{branch.code || `BR-${branch.id}`}</p>
                      </td>
                      <td className="px-4 py-4 text-sm text-muted-foreground">{composeAddress(branch)}</td>
                      <td className="px-4 py-4">
                        <p className="text-sm text-foreground">{branch.contactName}</p>
                        <p className="text-xs text-muted-foreground">{branch.contactPhone}</p>
                        <p className="text-xs text-muted-foreground">{branch.contactEmail}</p>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusStyles?.[branch.status] || statusStyles.inactive}`}>
                          {branch.status}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <Button
                          variant="outline"
                          size="sm"
                          iconName="Edit"
                          iconPosition="left"
                          onClick={() => handleEdit(branch)}
                        >
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!isLoading && branches.length === 0 && (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No branches available.
              </div>
            )}
          </div>

          {showForm && (
            <div className="bg-muted/30 border border-border rounded-lg p-4 md:p-5">
              <h3 className="text-base font-semibold text-foreground mb-4">
                {isEditing ? 'Edit Branch' : 'Add Branch'}
              </h3>
              <div className="space-y-3">
                <Input
                  label="Branch Name"
                  placeholder="Downtown Hub"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e?.target?.value)}
                  required
                />
                <Input
                  label="Contact Name"
                  placeholder="Priya Sharma"
                  value={formData.contactName}
                  onChange={(e) => handleInputChange('contactName', e?.target?.value)}
                />
                <Input
                  label="Contact Phone"
                  placeholder="+1 (555) 123-4567"
                  value={formData.contactPhone}
                  onChange={(e) => handleInputChange('contactPhone', e?.target?.value)}
                />
                <Input
                  label="Contact Email"
                  placeholder="branch@courierflow.com"
                  value={formData.contactEmail}
                  onChange={(e) => handleInputChange('contactEmail', e?.target?.value)}
                />
                <Input
                  label="Search Location"
                  placeholder="Search address or place"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e?.target?.value)}
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    iconName="Search"
                    iconPosition="left"
                    onClick={handleSearch}
                    disabled={isLoadingAddress}
                  >
                    {isLoadingAddress ? 'Searching...' : 'Search'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    iconName="LocateFixed"
                    iconPosition="left"
                    onClick={() => handleReverseGeocode(formData.lat, formData.lng)}
                    disabled={isLoadingAddress || !formData.lat || !formData.lng}
                  >
                    Use Coordinates
                  </Button>
                </div>

                <Input
                  label="Address Line"
                  placeholder="120 Market Street"
                  value={formData.addressLine}
                  onChange={(e) => handleInputChange('addressLine', e?.target?.value)}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Input
                    label="City"
                    placeholder="New York"
                    value={formData.city}
                    onChange={(e) => handleInputChange('city', e?.target?.value)}
                  />
                  <Input
                    label="Province"
                    placeholder="NY"
                    value={formData.province}
                    onChange={(e) => handleInputChange('province', e?.target?.value)}
                  />
                </div>
                <Input
                  label="Postal Code"
                  placeholder="10005"
                  value={formData.postalCode}
                  onChange={(e) => handleInputChange('postalCode', e?.target?.value)}
                />
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Latitude"
                    placeholder="40.7128"
                    value={formData.lat}
                    onChange={(e) => handleInputChange('lat', e?.target?.value)}
                  />
                  <Input
                    label="Longitude"
                    placeholder="-74.0060"
                    value={formData.lng}
                    onChange={(e) => handleInputChange('lng', e?.target?.value)}
                  />
                </div>
                {locationError && (
                  <p className="text-xs text-error">{locationError}</p>
                )}

                <div className="rounded-lg overflow-hidden border border-border h-48">
                  <MapContainer
                    center={mapCenter}
                    zoom={13}
                    scrollWheelZoom
                    className="w-full h-full"
                  >
                    <TileLayer
                      url={`https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=${geoapifyKey}`}
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    />
                    <MapClickHandler />
                    <Marker position={mapCenter} icon={markerIcon} />
                  </MapContainer>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    fullWidth
                    iconName={isEditing ? 'Save' : 'Plus'}
                    iconPosition="left"
                    onClick={handleSave}
                    disabled={isSaving}
                  >
                    {isSaving ? 'Saving...' : (isEditing ? 'Save Changes' : 'Add Branch')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    fullWidth
                    onClick={handleCancel}
                    disabled={isSaving}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BranchManagementPanel;
