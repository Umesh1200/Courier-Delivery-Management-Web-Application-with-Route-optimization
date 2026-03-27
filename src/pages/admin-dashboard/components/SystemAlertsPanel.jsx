import React, { useEffect, useMemo, useState } from 'react';
import { buildApiUrl } from '../../../utils/api';

const SystemAlertsPanel = () => {
  const [viewMode, setViewMode] = useState('open');
  const [alertRows, setAlertRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [historyStatusFilter, setHistoryStatusFilter] = useState('all');
  const [historyCategoryFilter, setHistoryCategoryFilter] = useState('all');
  const [historyLimit, setHistoryLimit] = useState(25);

  const statusMeta = {
    open: { label: 'Open', className: 'bg-error/10 text-error' },
    acknowledged: { label: 'Acknowledged', className: 'bg-warning/10 text-warning' },
    closed: { label: 'Closed', className: 'bg-success/10 text-success' }
  };

  const openCount = useMemo(
    () => alertRows?.filter((row) => row?.status === 'open')?.length || 0,
    [alertRows]
  );

  const historyCategoryOptions = useMemo(() => {
    const categories = Array.from(
      new Set(
        alertRows
          .map((row) => String(row?.category || '').trim())
          .filter((value) => value !== '')
      )
    ).sort((left, right) => left.localeCompare(right));
    return ['all', ...categories];
  }, [alertRows]);

  const visibleRows = useMemo(() => {
    if (viewMode !== 'history') {
      return alertRows;
    }

    const normalizedStatus = String(historyStatusFilter || 'all').toLowerCase();
    const normalizedCategory = String(historyCategoryFilter || 'all').toLowerCase();

    const filteredRows = alertRows.filter((row) => {
      const rowStatus = String(row?.status || '').toLowerCase();
      const rowCategory = String(row?.category || '').trim().toLowerCase();
      const statusMatch = normalizedStatus === 'all' || rowStatus === normalizedStatus;
      const categoryMatch = normalizedCategory === 'all' || rowCategory === normalizedCategory;
      return statusMatch && categoryMatch;
    });

    const parsedLimit = Number(historyLimit);
    if (Number.isFinite(parsedLimit) && parsedLimit > 0) {
      return filteredRows.slice(0, parsedLimit);
    }
    return filteredRows;
  }, [alertRows, historyCategoryFilter, historyLimit, historyStatusFilter, viewMode]);

  const loadAlerts = async (mode = viewMode) => {
    setIsLoading(true);
    setError('');
    try {
      const endpoint = mode === 'history'
        ? '/api/admin/system-alerts?status=&includeDemo=false'
        : '/api/admin/system-alerts?status=open&includeDemo=false';

      const res = await fetch(buildApiUrl(endpoint));
      if (!res.ok) {
        throw new Error('Failed to load system alerts');
      }
      const data = await res.json();
      const rows = Array.isArray(data?.alerts) ? data.alerts : [];
      setAlertRows(
        mode === 'history'
          ? rows.filter((row) => String(row?.status || '').toLowerCase() !== 'open')
          : rows
      );
    } catch (err) {
      setError('Unable to load system alerts right now.');
      setAlertRows([]);
    } finally {
      setIsLoading(false);
    }
  };

  const updateStatus = async (id, status) => {
    setError('');
    try {
      const res = await fetch(buildApiUrl(`/api/admin/system-alerts/${id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (!res.ok) {
        throw new Error('Failed to update alert');
      }
      await loadAlerts(viewMode);
    } catch (err) {
      setError('Unable to update alert status.');
    }
  };

  useEffect(() => {
    loadAlerts(viewMode);
  }, [viewMode]);

  return (
    <div className="bg-card rounded-xl p-4 md:p-6 shadow-elevation-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-1">System Alerts</h3>
          <p className="text-sm text-muted-foreground">
            {viewMode === 'history'
              ? 'Historical system alerts (acknowledged and closed)'
              : 'Only active alerts are shown when conditions occur'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setViewMode('open')}
            className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-smooth ${
              viewMode === 'open'
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-foreground hover:bg-muted'
            }`}
          >
            Open Alerts
          </button>
          <button
            type="button"
            onClick={() => setViewMode('history')}
            className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-smooth ${
              viewMode === 'history'
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-foreground hover:bg-muted'
            }`}
          >
            View History
          </button>
          <div className="text-xs text-muted-foreground">
            {viewMode === 'history' ? (
              <>History count: <span className="text-foreground font-medium">{visibleRows.length}</span></>
            ) : (
              <>Open alerts: <span className="text-foreground font-medium">{openCount}</span></>
            )}
          </div>
        </div>
      </div>
      {viewMode === 'history' && (
        <div className="mb-4 grid grid-cols-1 md:grid-cols-4 gap-2">
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            value={historyStatusFilter}
            onChange={(event) => setHistoryStatusFilter(event.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="closed">Closed</option>
          </select>
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            value={historyCategoryFilter}
            onChange={(event) => setHistoryCategoryFilter(event.target.value)}
          >
            {historyCategoryOptions.map((option) => (
              <option key={option} value={option}>
                {option === 'all' ? 'All Categories' : option}
              </option>
            ))}
          </select>
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            value={String(historyLimit)}
            onChange={(event) => setHistoryLimit(Number(event.target.value))}
          >
            <option value="10">Limit: 10</option>
            <option value="25">Limit: 25</option>
            <option value="50">Limit: 50</option>
            <option value="100">Limit: 100</option>
            <option value="250">Limit: 250</option>
          </select>
          <button
            type="button"
            onClick={() => {
              setHistoryStatusFilter('all');
              setHistoryCategoryFilter('all');
              setHistoryLimit(25);
            }}
            className="h-9 rounded-md border border-border px-2 text-xs font-medium text-foreground hover:bg-muted transition-smooth"
          >
            Reset Filters
          </button>
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}
      {isLoading && (
        <div className="py-10 text-center text-sm text-muted-foreground">
          Loading system alerts...
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="py-3 pr-4 font-medium">Category</th>
              <th className="py-3 pr-4 font-medium">Alert Name</th>
              <th className="py-3 pr-4 font-medium">Trigger Condition (Logic)</th>
              <th className="py-3 font-medium">Recommended Action</th>
              <th className="py-3 pr-4 font-medium">Occurred At</th>
              <th className="py-3 pr-4 font-medium">Status</th>
              <th className="py-3 font-medium text-right">Admin Action</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows?.map((row) => {
              const status = String(row?.status || '').toLowerCase();
              return (
                <tr key={row?.id} className="border-b border-border/60">
                  <td className="py-3 pr-4 text-foreground">{row?.category}</td>
                  <td className="py-3 pr-4 text-foreground font-medium">{row?.name}</td>
                  <td className="py-3 pr-4 text-muted-foreground">{row?.trigger}</td>
                  <td className="py-3 text-muted-foreground">{row?.action}</td>
                  <td className="py-3 pr-4 text-muted-foreground">
                    {row?.createdAt ? new Date(row.createdAt).toLocaleString() : 'N/A'}
                  </td>
                  <td className="py-3 pr-4">
                    <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${statusMeta?.[status]?.className || 'bg-muted text-muted-foreground'}`}>
                      {statusMeta?.[status]?.label || 'Unknown'}
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    {status === 'open' ? (
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateStatus(row?.id, 'acknowledged')}
                          className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted transition-smooth"
                        >
                          Acknowledge
                        </button>
                        <button
                          type="button"
                          onClick={() => updateStatus(row?.id, 'closed')}
                          className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted transition-smooth"
                        >
                          Close
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">No action</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!isLoading && visibleRows?.length === 0 && (
        <div className="py-10 text-center text-sm text-muted-foreground">
          {viewMode === 'history' ? 'No alert history found.' : 'No active alerts right now.'}
        </div>
      )}
    </div>
  );
};

export default SystemAlertsPanel;
