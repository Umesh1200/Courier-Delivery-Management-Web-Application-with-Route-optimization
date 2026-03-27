import React, { useMemo, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Icon from '../../../components/AppIcon';
import Input from '../../../components/ui/Input';
import Button from '../../../components/ui/Button';

const AddressForm = ({ formData, errors, onChange, postalIndex }) => {
  const [showPickupMap, setShowPickupMap] = useState(false);
  const [showDeliveryMap, setShowDeliveryMap] = useState(false);
  const [pickupSearch, setPickupSearch] = useState('');
  const [deliverySearch, setDeliverySearch] = useState('');
  const [pickupLocationError, setPickupLocationError] = useState('');
  const [deliveryLocationError, setDeliveryLocationError] = useState('');
  const [pickupPostalError, setPickupPostalError] = useState('');
  const [deliveryPostalError, setDeliveryPostalError] = useState('');
  const [isSearchingPickup, setIsSearchingPickup] = useState(false);
  const [isSearchingDelivery, setIsSearchingDelivery] = useState(false);
  const geoapifyKey = import.meta.env.VITE_GEOAPIFY_KEY || 'b2753bad7f63400ba6e69b971f16fe4e';

  const defaultCenter = useMemo(() => ({ lat: 27.7172, lng: 85.3240 }), []);
  const [pickupCoords, setPickupCoords] = useState(defaultCenter);
  const [deliveryCoords, setDeliveryCoords] = useState(defaultCenter);

  const nepalBounds = useMemo(
    () => L.latLngBounds(L.latLng(26.347, 80.058), L.latLng(30.447, 88.201)),
    []
  );

  const markerIcon = useMemo(
    () => L.icon({
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41]
    }),
    []
  );

  const handleAddressAutocomplete = (type, value) => {
    onChange(type, value);
    
    // Mock autocomplete suggestions
    if (value?.length > 3) {
      const suggestions = [
        '123 Main Street, New York, NY 10001',
        '456 Oak Avenue, Brooklyn, NY 11201',
        '789 Pine Road, Queens, NY 11354'
      ];
      // In real implementation, this would trigger autocomplete dropdown
    }
  };

  const normalizePostal = (value) => String(value || '').replace(/\D/g, '');
  const normalizeDistrictKey = (value) =>
    String(value || '')
      .toLowerCase()
      .replace(/district|province|zone|metropolitan|sub-metropolitan|municipality|rural municipality|r\.m\.|mun\.?/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const getDistrictCandidates = (value) => {
    if (!postalIndex?.byDistrict) {
      return [];
    }
    const normalized = normalizeDistrictKey(value);
    if (!normalized) {
      return [];
    }
    const exact = postalIndex.byDistrict.get(normalized);
    if (exact?.length) {
      return exact;
    }
    for (const [district, codes] of postalIndex.byDistrict.entries()) {
      if (district.includes(normalized) || normalized.includes(district)) {
        return codes || [];
      }
    }
    return [];
  };

  const pickOptimalPostal = (result, suggested) => {
    if (!postalIndex?.codes) {
      return suggested || '';
    }
    const normalized = normalizePostal(suggested);
    if (normalized && postalIndex.codes.has(normalized)) {
      return normalized;
    }

    const district = result?.district || result?.county || result?.city || result?.state || '';
    const candidates = getDistrictCandidates(district);
    if (candidates.length === 0) {
      return normalized || '';
    }
    if (!normalized) {
      return candidates[0];
    }
    let closest = candidates[0];
    let bestDiff = Math.abs(Number(candidates[0]) - Number(normalized));
    for (const code of candidates) {
      const diff = Math.abs(Number(code) - Number(normalized));
      if (diff < bestDiff) {
        bestDiff = diff;
        closest = code;
      }
    }
    return closest;
  };

  const validatePostal = (type, value) => {
    const normalized = normalizePostal(value);
    if (!normalized) {
      return '';
    }
    if (postalIndex?.codes && !postalIndex.codes.has(normalized)) {
      return 'Postal code must be a valid Nepal postal code.';
    }
    return '';
  };

  const handlePostalChange = (type, value) => {
    const normalized = normalizePostal(value);
    let resolved = normalized;
    let error = validatePostal(type, normalized);
    if (error && postalIndex?.codes) {
      const hint =
        type === 'pickupPostalCode'
          ? (formData?.pickupCity || formData?.pickupProvince || '')
          : (formData?.deliveryCity || formData?.deliveryProvince || '');
      const fallback = pickOptimalPostal({ district: hint, city: hint, state: hint }, normalized);
      if (fallback && postalIndex.codes.has(fallback)) {
        resolved = fallback;
        error = '';
      }
    }
    if (type === 'pickupPostalCode') {
      setPickupPostalError(error);
    } else {
      setDeliveryPostalError(error);
    }
    onChange(type, resolved);
  };

  const isNepalResult = (result) => {
    const code = (result?.country_code || '').toLowerCase();
    const name = (result?.country || '').toLowerCase();
    return code === 'np' || name === 'nepal';
  };

  const applyAddressResult = (type, result, lat, lng) => {
    if (!isNepalResult(result)) {
      const message = 'Only locations within Nepal are supported.';
      if (type === 'pickup') {
        setPickupLocationError(message);
      } else {
        setDeliveryLocationError(message);
      }
      return;
    }

    const addressLine = result?.address_line1 || result?.formatted || '';
    const city = result?.city || result?.county || '';
    const province = result?.state || '';
    const postal = pickOptimalPostal(result, result?.postcode || '');

    if (type === 'pickup') {
      setPickupLocationError('');
      setPickupCoords({ lat, lng });
      onChange('pickupAddress', addressLine);
      onChange('pickupCity', city);
      onChange('pickupProvince', province);
      onChange('pickupPostalCode', postal);
      onChange('pickupLat', lat);
      onChange('pickupLng', lng);
      setPickupPostalError(validatePostal('pickupPostalCode', postal));
    } else {
      setDeliveryLocationError('');
      setDeliveryCoords({ lat, lng });
      onChange('deliveryAddress', addressLine);
      onChange('deliveryCity', city);
      onChange('deliveryProvince', province);
      onChange('deliveryPostalCode', postal);
      onChange('deliveryLat', lat);
      onChange('deliveryLng', lng);
      setDeliveryPostalError(validatePostal('deliveryPostalCode', postal));
    }
  };

  const handleReverseGeocode = async (type, lat, lng) => {
    if (!geoapifyKey) {
      const message = 'Map search is unavailable. Configure VITE_GEOAPIFY_KEY.';
      if (type === 'pickup') {
        setPickupLocationError(message);
      } else {
        setDeliveryLocationError(message);
      }
      return;
    }
    if (!nepalBounds.contains(L.latLng(lat, lng))) {
      const message = 'Selected location is outside Nepal.';
      if (type === 'pickup') {
        setPickupLocationError(message);
      } else {
        setDeliveryLocationError(message);
      }
      return;
    }
    try {
      const response = await fetch(
        `https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${lng}&format=json&apiKey=${geoapifyKey}`
      );
      if (!response.ok) {
        throw new Error(`Geoapify request failed (${response.status})`);
      }
      const data = await response.json();
      const result = data?.results?.[0];
      if (!result) {
        throw new Error('No address found in Geoapify.');
      }
      applyAddressResult(type, result, lat, lng);
    } catch (error) {
      try {
        const fallback = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1&countrycodes=np`
        );
        if (!fallback.ok) {
          throw new Error(`Nominatim request failed (${fallback.status})`);
        }
        const data = await fallback.json();
        if (!data?.address) {
          throw new Error('No address found in fallback.');
        }
        const normalized = {
          formatted: data?.display_name || '',
          address_line1: data?.address?.road || data?.address?.neighbourhood || data?.address?.suburb || data?.address?.village || '',
          city: data?.address?.city || data?.address?.town || data?.address?.village || '',
          county: data?.address?.county || '',
          state: data?.address?.state || '',
          postcode: data?.address?.postcode || '',
          country: data?.address?.country || '',
          country_code: data?.address?.country_code || ''
        };
        applyAddressResult(type, normalized, lat, lng);
      } catch (fallbackError) {
        const message = error?.message?.includes('Geoapify')
          ? `${error.message} - check API key or quota.`
          : 'Failed to fetch address. Please try again.';
        if (type === 'pickup') {
          setPickupLocationError(message);
        } else {
          setDeliveryLocationError(message);
        }
      }
    }
  };

  const handleSearch = async (type) => {
    const query = type === 'pickup' ? pickupSearch : deliverySearch;
    if (!query) {
      const message = 'Enter a location to search.';
      if (type === 'pickup') {
        setPickupLocationError(message);
      } else {
        setDeliveryLocationError(message);
      }
      return;
    }
    if (!geoapifyKey) {
      const message = 'Map search is unavailable. Configure VITE_GEOAPIFY_KEY.';
      if (type === 'pickup') {
        setPickupLocationError(message);
      } else {
        setDeliveryLocationError(message);
      }
      return;
    }

    if (type === 'pickup') {
      setIsSearchingPickup(true);
      setPickupLocationError('');
    } else {
      setIsSearchingDelivery(true);
      setDeliveryLocationError('');
    }

    try {
      const response = await fetch(
        `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(query)}&format=json&filter=countrycode:np&apiKey=${geoapifyKey}`
      );
      if (!response.ok) {
        throw new Error(`Geoapify request failed (${response.status})`);
      }
      const data = await response.json();
      const result = data?.results?.[0];
      if (!result) {
        throw new Error('No Geoapify results.');
      }
      applyAddressResult(type, result, result.lat, result.lon);
    } catch (error) {
      try {
        const fallback = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=np&q=${encodeURIComponent(query)}`
        );
        if (!fallback.ok) {
          throw new Error(`Nominatim request failed (${fallback.status})`);
        }
        const data = await fallback.json();
        const result = data?.[0];
        if (!result) {
          throw new Error('No results found in Nepal.');
        }
        const normalized = {
          formatted: result?.display_name || '',
          address_line1: result?.display_name || '',
          city: '',
          county: '',
          state: '',
          postcode: '',
          country: 'Nepal',
          country_code: 'np'
        };
        applyAddressResult(type, normalized, Number(result.lat), Number(result.lon));
      } catch (fallbackError) {
        const message = error?.message?.includes('Geoapify')
          ? `${error.message} - check API key or quota.`
          : 'Search failed. Please try again.';
        if (type === 'pickup') {
          setPickupLocationError(message);
        } else {
          setDeliveryLocationError(message);
        }
      }
    } finally {
      if (type === 'pickup') {
        setIsSearchingPickup(false);
      } else {
        setIsSearchingDelivery(false);
      }
    }
  };

  const MapClickHandler = ({ type }) => {
    useMapEvents({
      click(event) {
        handleReverseGeocode(type, event.latlng.lat, event.latlng.lng);
      }
    });
    return null;
  };

  const MapUpdater = ({ center }) => {
    const map = useMap();
    React.useEffect(() => {
      map.setView(center);
    }, [center, map]);
    return null;
  };

  return (
    <div className="bg-card rounded-xl p-4 md:p-6 lg:p-8 shadow-elevation-md">
      <div className="flex items-center gap-3 mb-4 md:mb-6">
        <div className="w-10 h-10 md:w-12 md:h-12 bg-accent/10 rounded-lg flex items-center justify-center">
          <Icon name="MapPin" size={20} color="var(--color-accent)" />
        </div>
        <div>
          <h2 className="text-lg md:text-xl lg:text-2xl font-semibold text-foreground">Pickup & Delivery Addresses</h2>
          <p className="text-xs md:text-sm text-muted-foreground">Enter complete address details</p>
        </div>
      </div>
      <div className="space-y-6 md:space-y-8">
        {/* Pickup Address Section */}
        <div className="border border-border rounded-lg p-4 md:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base md:text-lg font-semibold text-foreground flex items-center gap-2">
              <Icon name="PackageCheck" size={18} color="var(--color-success)" />
              Pickup Address
            </h3>
            <Button
              variant="ghost"
              size="sm"
              iconName="Map"
              iconPosition="left"
              onClick={() => setShowPickupMap(!showPickupMap)}
            >
              {showPickupMap ? 'Hide' : 'Show'} Map
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <Input
              label="Street Address"
              type="text"
              placeholder="Enter pickup address"
              value={formData?.pickupAddress}
              onChange={(e) => handleAddressAutocomplete('pickupAddress', e?.target?.value)}
              error={errors?.pickupAddress}
              required
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="City"
                type="text"
                placeholder="City"
                value={formData?.pickupCity}
                onChange={(e) => onChange('pickupCity', e?.target?.value)}
                error={errors?.pickupCity}
                required
              />
              <Input
                label="Province"
                type="text"
                placeholder="Province"
                value={formData?.pickupProvince}
                onChange={(e) => onChange('pickupProvince', e?.target?.value)}
                error={errors?.pickupProvince}
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Postal Code"
                type="text"
                placeholder="Postal Code"
                value={formData?.pickupPostalCode}
                onChange={(e) => handlePostalChange('pickupPostalCode', e?.target?.value)}
                error={errors?.pickupPostalCode || pickupPostalError}
                required
                maxLength="10"
              />
              <Input
                label="Contact Phone"
                type="tel"
                placeholder="+977-9812345678"
                value={formData?.pickupPhone}
                onChange={(e) => onChange('pickupPhone', e?.target?.value)}
                error={errors?.pickupPhone}
                required
              />
            </div>

            <Input
              label="Contact Name"
              type="text"
              placeholder="Name of person at pickup location"
              value={formData?.pickupContactName}
              onChange={(e) => onChange('pickupContactName', e?.target?.value)}
              error={errors?.pickupContactName}
              required
            />

            {showPickupMap && (
              <div className="space-y-3">
                <div className="flex flex-col md:flex-row gap-2">
                  <Input
                    label="Search Location (Nepal only)"
                    placeholder="Search pickup location"
                    value={pickupSearch}
                    onChange={(e) => setPickupSearch(e?.target?.value)}
                  />
                  <div className="flex items-end">
                    <Button
                      variant="outline"
                      size="sm"
                      iconName="Search"
                      iconPosition="left"
                      onClick={() => handleSearch('pickup')}
                      disabled={isSearchingPickup}
                    >
                      {isSearchingPickup ? 'Searching...' : 'Search'}
                    </Button>
                  </div>
                </div>
                {pickupLocationError && (
                  <p className="text-xs text-error">{pickupLocationError}</p>
                )}
                <div className="w-full h-56 md:h-72 rounded-lg overflow-hidden border border-border">
                  <MapContainer
                    center={[pickupCoords.lat, pickupCoords.lng]}
                    zoom={13}
                    scrollWheelZoom
                    maxBounds={nepalBounds}
                    maxBoundsViscosity={1.0}
                    className="w-full h-full"
                  >
                    <TileLayer
                      url={`https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=${geoapifyKey}`}
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    />
                    <MapUpdater center={[pickupCoords.lat, pickupCoords.lng]} />
                    <MapClickHandler type="pickup" />
                    <Marker position={[pickupCoords.lat, pickupCoords.lng]} icon={markerIcon} />
                  </MapContainer>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Delivery Address Section */}
        <div className="border border-border rounded-lg p-4 md:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base md:text-lg font-semibold text-foreground flex items-center gap-2">
              <Icon name="MapPinned" size={18} color="var(--color-accent)" />
              Delivery Address
            </h3>
            <Button
              variant="ghost"
              size="sm"
              iconName="Map"
              iconPosition="left"
              onClick={() => setShowDeliveryMap(!showDeliveryMap)}
            >
              {showDeliveryMap ? 'Hide' : 'Show'} Map
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <Input
              label="Street Address"
              type="text"
              placeholder="Enter delivery address"
              value={formData?.deliveryAddress}
              onChange={(e) => handleAddressAutocomplete('deliveryAddress', e?.target?.value)}
              error={errors?.deliveryAddress}
              required
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="City"
                type="text"
                placeholder="City"
                value={formData?.deliveryCity}
                onChange={(e) => onChange('deliveryCity', e?.target?.value)}
                error={errors?.deliveryCity}
                required
              />
              <Input
                label="Province"
                type="text"
                placeholder="Province"
                value={formData?.deliveryProvince}
                onChange={(e) => onChange('deliveryProvince', e?.target?.value)}
                error={errors?.deliveryProvince}
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Postal Code"
                type="text"
                placeholder="Postal Code"
                value={formData?.deliveryPostalCode}
                onChange={(e) => handlePostalChange('deliveryPostalCode', e?.target?.value)}
                error={errors?.deliveryPostalCode || deliveryPostalError}
                required
                maxLength="10"
              />
              <Input
                label="Contact Phone"
                type="tel"
                placeholder="+977-9812345678"
                value={formData?.deliveryPhone}
                onChange={(e) => onChange('deliveryPhone', e?.target?.value)}
                error={errors?.deliveryPhone}
                required
              />
            </div>

            <Input
              label="Contact Name"
              type="text"
              placeholder="Name of person at delivery location"
              value={formData?.deliveryContactName}
              onChange={(e) => onChange('deliveryContactName', e?.target?.value)}
              error={errors?.deliveryContactName}
              required
            />

            {showDeliveryMap && (
              <div className="space-y-3">
                <div className="flex flex-col md:flex-row gap-2">
                  <Input
                    label="Search Location (Nepal only)"
                    placeholder="Search delivery location"
                    value={deliverySearch}
                    onChange={(e) => setDeliverySearch(e?.target?.value)}
                  />
                  <div className="flex items-end">
                    <Button
                      variant="outline"
                      size="sm"
                      iconName="Search"
                      iconPosition="left"
                      onClick={() => handleSearch('delivery')}
                      disabled={isSearchingDelivery}
                    >
                      {isSearchingDelivery ? 'Searching...' : 'Search'}
                    </Button>
                  </div>
                </div>
                {deliveryLocationError && (
                  <p className="text-xs text-error">{deliveryLocationError}</p>
                )}
                <div className="w-full h-56 md:h-72 rounded-lg overflow-hidden border border-border">
                  <MapContainer
                    center={[deliveryCoords.lat, deliveryCoords.lng]}
                    zoom={13}
                    scrollWheelZoom
                    maxBounds={nepalBounds}
                    maxBoundsViscosity={1.0}
                    className="w-full h-full"
                  >
                    <TileLayer
                      url={`https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=${geoapifyKey}`}
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    />
                    <MapUpdater center={[deliveryCoords.lat, deliveryCoords.lng]} />
                    <MapClickHandler type="delivery" />
                    <Marker position={[deliveryCoords.lat, deliveryCoords.lng]} icon={markerIcon} />
                  </MapContainer>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="mt-4 md:mt-6 p-3 md:p-4 bg-muted rounded-lg">
        <div className="flex items-start gap-3">
          <Icon name="AlertCircle" size={18} color="var(--color-warning)" className="flex-shrink-0 mt-0.5" />
          <div className="text-xs md:text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Address Requirements:</p>
            <p>Ensure addresses are complete and accurate. Incorrect addresses may result in delivery delays or additional charges.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddressForm;
