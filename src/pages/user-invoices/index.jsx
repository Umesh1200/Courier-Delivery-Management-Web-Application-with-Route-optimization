import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import RoleBasedNavigation from '../../components/ui/RoleBasedNavigation';
import QuickActionPanel from '../../components/ui/QuickActionPanel';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { buildApiUrl } from '../../utils/api';
import { formatRs } from '../../utils/format';

const STATUS_FILTERS = [
  { value: 'all', label: 'All Status' },
  { value: 'paid', label: 'Paid' },
  { value: 'pending', label: 'Pending' },
  { value: 'refunded', label: 'Refunded' },
  { value: 'failed', label: 'Failed' }
];

const STATUS_CLASSNAME = {
  paid: 'bg-success/15 border-success/30 text-success',
  pending: 'bg-warning/15 border-warning/30 text-warning',
  refunded: 'bg-primary/15 border-primary/30 text-primary',
  failed: 'bg-error/15 border-error/30 text-error'
};

const formatStatusLabel = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    return 'pending';
  }
  return normalized.replaceAll('_', ' ');
};

const formatPaymentMethod = (method, provider) => {
  const normalizedMethod = String(method || '').trim().toLowerCase();
  const normalizedProvider = String(provider || '').trim().toLowerCase();
  if (normalizedMethod === 'cash') {
    return 'Cash on Pickup';
  }
  if (normalizedMethod === 'wallet' && normalizedProvider === 'khalti') {
    return 'Khalti Wallet';
  }
  if (normalizedMethod === 'wallet') {
    return 'Wallet';
  }
  if (normalizedMethod === 'credit-card') {
    return 'Credit Card';
  }
  if (normalizedMethod === 'debit-card') {
    return 'Debit Card';
  }
  return normalizedMethod || 'N/A';
};

const formatDateTime = (value) => {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString();
};

const escapeHtml = (value) => String(value || '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const buildInvoiceHtml = (invoice) => {
  const breakdown = invoice?.breakdown || {};
  const bookingCode = String(invoice?.bookingCode || '').trim() || 'N/A';
  const invoiceNumber = String(invoice?.invoiceNumber || '').trim() || `INV-${invoice?.paymentId || 'N/A'}`;
  const issuedAt = formatDateTime(invoice?.issuedAt);
  const paidAt = invoice?.paidAt ? formatDateTime(invoice.paidAt) : 'Not paid yet';
  const paymentMethodLabel = formatPaymentMethod(invoice?.paymentMethod, invoice?.paymentProvider);
  const paymentStatus = formatStatusLabel(invoice?.paymentStatus);
  const paymentReference = String(invoice?.paymentReference || '').trim() || 'N/A';
  const serviceType = String(invoice?.serviceType || '').trim() || 'N/A';
  const packageType = String(invoice?.packageType || '').trim() || 'N/A';
  const packageWeight = String(invoice?.packageWeight || '').trim() || 'N/A';
  const pickupAddress = String(invoice?.pickupAddress || '').trim() || 'N/A';
  const deliveryAddress = String(invoice?.deliveryAddress || '').trim() || 'N/A';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(invoiceNumber)}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
    .brand { font-size: 20px; font-weight: 700; color: #1d4ed8; }
    .subtitle { color: #6b7280; font-size: 12px; margin-top: 4px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
    .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; }
    .label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em; }
    .value { margin-top: 4px; font-size: 14px; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border: 1px solid #e5e7eb; padding: 8px; text-align: left; font-size: 12px; }
    th { background: #f3f4f6; font-weight: 600; }
    .footer { margin-top: 20px; font-size: 11px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">CourierFlow Invoice</div>
      <div class="subtitle">Generated: ${escapeHtml(new Date().toLocaleString())}</div>
    </div>
    <div style="text-align:right">
      <div class="label">Invoice Number</div>
      <div class="value">${escapeHtml(invoiceNumber)}</div>
      <div class="label" style="margin-top:8px">Booking</div>
      <div class="value">${escapeHtml(bookingCode)}</div>
    </div>
  </div>

  <div class="grid">
    <div class="card">
      <div class="label">Issued At</div>
      <div class="value">${escapeHtml(issuedAt)}</div>
      <div class="label" style="margin-top:8px">Paid At</div>
      <div class="value">${escapeHtml(paidAt)}</div>
      <div class="label" style="margin-top:8px">Payment Status</div>
      <div class="value">${escapeHtml(paymentStatus)}</div>
    </div>
    <div class="card">
      <div class="label">Payment Method</div>
      <div class="value">${escapeHtml(paymentMethodLabel)}</div>
      <div class="label" style="margin-top:8px">Reference</div>
      <div class="value">${escapeHtml(paymentReference)}</div>
      <div class="label" style="margin-top:8px">Service</div>
      <div class="value">${escapeHtml(serviceType)}</div>
    </div>
  </div>

  <div class="grid">
    <div class="card">
      <div class="label">Package</div>
      <div class="value">${escapeHtml(packageType)} (${escapeHtml(packageWeight)})</div>
      <div class="label" style="margin-top:8px">Pickup Address</div>
      <div class="value">${escapeHtml(pickupAddress)}</div>
      <div class="label" style="margin-top:8px">Delivery Address</div>
      <div class="value">${escapeHtml(deliveryAddress)}</div>
    </div>
    <div class="card">
      <div class="label">Amount Breakdown</div>
      <table>
        <tr><th>Item</th><th>Amount</th></tr>
        <tr><td>Base Rate</td><td>${escapeHtml(formatRs(breakdown?.baseRate || 0))}</td></tr>
        <tr><td>Distance Fee</td><td>${escapeHtml(formatRs(breakdown?.distanceFee || 0))}</td></tr>
        <tr><td>Service Fee</td><td>${escapeHtml(formatRs(breakdown?.serviceFee || 0))}</td></tr>
        <tr><td>Additional Fees</td><td>${escapeHtml(formatRs(breakdown?.additionalFees || 0))}</td></tr>
        <tr><td>Subtotal</td><td>${escapeHtml(formatRs(breakdown?.subtotal || 0))}</td></tr>
        <tr><td>Tax</td><td>${escapeHtml(formatRs(breakdown?.tax || 0))}</td></tr>
        <tr><td>Discount</td><td>${escapeHtml(formatRs(breakdown?.discount || 0))}</td></tr>
        <tr><th>Total</th><th>${escapeHtml(formatRs(breakdown?.total || 0))}</th></tr>
      </table>
    </div>
  </div>

  <div class="footer">
    This is a system-generated invoice from CourierFlow.
  </div>
</body>
</html>`;
};

const UserInvoices = () => {
  const navigate = useNavigate();
  const userId = Number(localStorage.getItem('userId') || 0);
  const userName = localStorage.getItem('userName') || 'User';
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [summary, setSummary] = useState({
    totalInvoices: 0,
    totalAmount: 0,
    paidInvoices: 0,
    paidAmount: 0,
    refundedAmount: 0
  });
  const [invoices, setInvoices] = useState([]);

  useEffect(() => {
    let isMounted = true;
    const loadInvoices = async () => {
      if (!Number.isFinite(userId) || userId <= 0) {
        if (isMounted) {
          setIsLoading(false);
          setError('Sign in to view invoices.');
        }
        return;
      }
      try {
        setIsLoading(true);
        setError('');
        const params = new URLSearchParams({
          userId: String(userId),
          status: statusFilter
        });
        const response = await fetch(buildApiUrl(`/api/customer/invoices?${params.toString()}`));
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || 'Unable to load invoices right now.');
        }
        if (!isMounted) {
          return;
        }
        setSummary({
          totalInvoices: Number(payload?.summary?.totalInvoices || 0),
          totalAmount: Number(payload?.summary?.totalAmount || 0),
          paidInvoices: Number(payload?.summary?.paidInvoices || 0),
          paidAmount: Number(payload?.summary?.paidAmount || 0),
          refundedAmount: Number(payload?.summary?.refundedAmount || 0)
        });
        setInvoices(Array.isArray(payload?.invoices) ? payload.invoices : []);
      } catch (loadError) {
        if (!isMounted) {
          return;
        }
        setError(loadError?.message || 'Unable to load invoices right now.');
        setSummary({
          totalInvoices: 0,
          totalAmount: 0,
          paidInvoices: 0,
          paidAmount: 0,
          refundedAmount: 0
        });
        setInvoices([]);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadInvoices();
    return () => {
      isMounted = false;
    };
  }, [statusFilter, userId]);

  const filteredInvoices = useMemo(() => {
    const normalizedSearch = String(searchQuery || '').trim().toLowerCase();
    if (!normalizedSearch) {
      return invoices;
    }
    return (invoices || []).filter((invoice) => {
      const invoiceNumber = String(invoice?.invoiceNumber || '').toLowerCase();
      const bookingCode = String(invoice?.bookingCode || '').toLowerCase();
      const paymentReference = String(invoice?.paymentReference || '').toLowerCase();
      return invoiceNumber.includes(normalizedSearch)
        || bookingCode.includes(normalizedSearch)
        || paymentReference.includes(normalizedSearch);
    });
  }, [invoices, searchQuery]);

  const handleDownloadInvoice = (invoice) => {
    const invoiceHtml = buildInvoiceHtml(invoice);
    const blob = new Blob([invoiceHtml], { type: 'text/html;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const rawInvoiceNumber = String(
      invoice?.invoiceNumber || `invoice-${invoice?.paymentId || Date.now()}`
    ).trim();
    const safeInvoiceNumber = rawInvoiceNumber.replace(/[^a-zA-Z0-9-_]/g, '-');
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `${safeInvoiceNumber || 'invoice'}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  };

  return (
    <div className="min-h-screen bg-background">
      <RoleBasedNavigation userRole="customer" userName={userName} />
      <QuickActionPanel userRole="customer" />

      <main className="pt-[60px] px-4 md:px-6 lg:px-8 pb-10">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mt-6 mb-6">
            <div>
              <h1 className="text-2xl md:text-3xl font-semibold text-foreground">Invoices</h1>
              <p className="text-sm text-muted-foreground mt-1">View and download your payment invoices.</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              iconName="ArrowLeft"
              iconPosition="left"
              onClick={() => navigate('/user-dashboard')}
            >
              Back to Dashboard
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4 mb-6">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Total Invoices</p>
              <p className="mt-1 text-xl font-semibold text-foreground">{summary.totalInvoices}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Total Amount</p>
              <p className="mt-1 text-xl font-semibold text-foreground">{formatRs(summary.totalAmount)}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Paid Invoices</p>
              <p className="mt-1 text-xl font-semibold text-foreground">{summary.paidInvoices}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Refunded Amount</p>
              <p className="mt-1 text-xl font-semibold text-foreground">{formatRs(summary.refundedAmount)}</p>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="p-4 md:p-5 border-b border-border grid grid-cols-1 md:grid-cols-3 gap-3">
              <Input
                type="search"
                placeholder="Search invoice or booking code"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event?.target?.value || '')}
              />
              <div className="md:col-span-1">
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(String(event?.target?.value || 'all'))}
                  className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {STATUS_FILTERS.map((statusOption) => (
                    <option key={statusOption.value} value={statusOption.value}>
                      {statusOption.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="text-xs text-muted-foreground flex items-center md:justify-end">
                Showing {filteredInvoices.length} invoice(s)
              </div>
            </div>

            {isLoading ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">Loading invoices...</div>
            ) : error ? (
              <div className="px-4 py-10 text-center text-sm text-error">{error}</div>
            ) : filteredInvoices.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">No invoices found.</div>
            ) : (
              <>
                <div className="hidden lg:block overflow-x-auto">
                  <table className="w-full min-w-[980px]">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Invoice</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Booking</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Issued</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Method</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Total</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInvoices.map((invoice) => {
                        const statusCode = String(invoice?.paymentStatus || '').trim().toLowerCase();
                        return (
                          <tr key={invoice?.paymentId} className="border-t border-border">
                            <td className="px-4 py-3 text-sm text-foreground font-medium">{invoice?.invoiceNumber}</td>
                            <td className="px-4 py-3 text-sm text-foreground">{invoice?.bookingCode || '-'}</td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">{formatDateTime(invoice?.issuedAt)}</td>
                            <td className="px-4 py-3 text-sm text-foreground">
                              {formatPaymentMethod(invoice?.paymentMethod, invoice?.paymentProvider)}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${STATUS_CLASSNAME[statusCode] || STATUS_CLASSNAME.pending}`}>
                                {formatStatusLabel(statusCode)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm font-semibold text-foreground">
                              {formatRs(invoice?.breakdown?.total || 0)}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="xs"
                                  iconName="MapPin"
                                  onClick={() => navigate(`/order-tracking?id=${encodeURIComponent(invoice?.bookingCode || '')}`)}
                                >
                                  Track
                                </Button>
                                <Button
                                  variant="default"
                                  size="xs"
                                  iconName="Download"
                                  onClick={() => handleDownloadInvoice(invoice)}
                                >
                                  Download
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="lg:hidden p-3 space-y-3">
                  {filteredInvoices.map((invoice) => {
                    const statusCode = String(invoice?.paymentStatus || '').trim().toLowerCase();
                    return (
                      <div key={invoice?.paymentId} className="rounded-lg border border-border p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-foreground">{invoice?.invoiceNumber}</p>
                            <p className="text-xs text-muted-foreground">Booking {invoice?.bookingCode || '-'}</p>
                          </div>
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${STATUS_CLASSNAME[statusCode] || STATUS_CLASSNAME.pending}`}>
                            {formatStatusLabel(statusCode)}
                          </span>
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground space-y-1">
                          <p>Issued: {formatDateTime(invoice?.issuedAt)}</p>
                          <p>Method: {formatPaymentMethod(invoice?.paymentMethod, invoice?.paymentProvider)}</p>
                          <p className="text-foreground font-medium">Total: {formatRs(invoice?.breakdown?.total || 0)}</p>
                        </div>
                        <div className="mt-3 flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="xs"
                            iconName="MapPin"
                            onClick={() => navigate(`/order-tracking?id=${encodeURIComponent(invoice?.bookingCode || '')}`)}
                          >
                            Track
                          </Button>
                          <Button
                            variant="default"
                            size="xs"
                            iconName="Download"
                            onClick={() => handleDownloadInvoice(invoice)}
                          >
                            Download
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default UserInvoices;
