import React, { useEffect, useState } from 'react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import { buildApiUrl } from '../../../utils/api';

const CourierLocationPanel = () => {
  const [locations, setLocations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadLocations = async () => {
    setIsLoading(true);
    setError('');
    try {
      const res = await fetch(buildApiUrl('/api/admin/courier-locations'));
      if (!res.ok) {
        throw new Error('Failed to load courier locations');
      }
      const data = await res.json();
      setLocations(data?.locations || []);
    } catch (err) {
      setError('Unable to load courier locations right now.');
      setLocations([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLocations();
    const intervalId = setInterval(loadLocations, 15000);
    return () => clearInterval(intervalId);
  }, []);

  const formatUpdated = (value) => {
    if (!value) {
      return 'N/A';
    }
    const date = new Date(value);
    if (Number.isNaN(date?.getTime())) {
      return value;
    }
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const buildGoogleMapsUrl = (latitude, longitude) =>
    `https://www.google.com/maps?q=${latitude},${longitude}`;

  return (
    <div className="bg-card rounded-xl p-4 md:p-6 shadow-elevation-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-1">Courier Live Locations</h3>
          <p className="text-sm text-muted-foreground">Last known GPS snapshot from courier devices</p>
        </div>
        <Button variant="outline" size="sm" iconName="RefreshCw" iconPosition="left" onClick={loadLocations}>
          Refresh
        </Button>
      </div>
      {error && (
        <div className="mb-4 rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}
      {isLoading && (
        <div className="py-8 text-center text-sm text-muted-foreground">
          Loading courier locations...
        </div>
      )}
      {!isLoading && locations.length === 0 && !error && (
        <div className="py-8 text-center text-sm text-muted-foreground">
          No live locations available.
        </div>
      )}
      {!isLoading && locations.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="py-3 pr-4 font-medium">Courier</th>
                <th className="py-3 pr-4 font-medium">Role</th>
                <th className="py-3 pr-4 font-medium">Branch</th>
                <th className="py-3 pr-4 font-medium">Coordinates</th>
                <th className="py-3 font-medium">Last Update</th>
              </tr>
            </thead>
            <tbody>
              {locations.map((row) => {
                const latitude = Number(row?.latitude);
                const longitude = Number(row?.longitude);
                const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);

                return (
                  <tr key={row.courierId} className="border-b border-border/60">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <Icon name="User" size={14} className="text-muted-foreground" />
                        <div>
                          <p className="text-sm text-foreground">{row.courierName}</p>
                          <p className="text-xs text-muted-foreground">{row.phone || 'No phone'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">{row.courierRole || 'N/A'}</td>
                    <td className="py-3 pr-4 text-muted-foreground">{row.branch || 'Unassigned'}</td>
                    <td className="py-3 pr-4">
                      {hasCoordinates ? (
                        <a
                          href={buildGoogleMapsUrl(latitude, longitude)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          <span>{latitude.toFixed(5)}, {longitude.toFixed(5)}</span>
                          <Icon name="ExternalLink" size={12} />
                        </a>
                      ) : (
                        <span className="text-muted-foreground">N/A</span>
                      )}
                    </td>
                    <td className="py-3 text-muted-foreground">{formatUpdated(row.updatedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default CourierLocationPanel;
