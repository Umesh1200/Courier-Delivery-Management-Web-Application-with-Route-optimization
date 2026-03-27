import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import { buildApiUrl } from '../../../utils/api';

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' }
];

const STATUS_STYLES = {
  open: 'bg-warning/15 text-warning border-warning/30',
  in_progress: 'bg-primary/15 text-primary border-primary/30',
  resolved: 'bg-success/15 text-success border-success/30',
  closed: 'bg-muted text-muted-foreground border-border'
};

const toStatusLabel = (value) => String(value || '').replaceAll('_', ' ') || 'open';

const SupportTicketsPanel = () => {
  const adminId = Number(localStorage.getItem('userId') || 0);
  const [statusFilter, setStatusFilter] = useState('open');
  const [tickets, setTickets] = useState([]);
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [selectedStatus, setSelectedStatus] = useState('open');
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [loadError, setLoadError] = useState('');

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => Number(ticket?.id) === Number(selectedTicketId)) || null,
    [selectedTicketId, tickets]
  );

  useEffect(() => {
    if (selectedTicket?.status) {
      setSelectedStatus(String(selectedTicket.status).toLowerCase());
    }
  }, [selectedTicket?.status]);

  const loadTickets = useCallback(async () => {
    if (!Number.isFinite(adminId) || adminId <= 0) {
      return;
    }
    try {
      setLoadError('');
      const params = new URLSearchParams({
        userId: String(adminId),
        role: 'admin',
        status: statusFilter || 'all',
        limit: '150'
      });
      const response = await fetch(buildApiUrl(`/api/support/tickets?${params.toString()}`));
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to load support tickets.');
      }
      const rows = Array.isArray(payload?.tickets) ? payload.tickets : [];
      setTickets(rows);
      if (rows.length > 0) {
        setSelectedTicketId((prev) => {
          const exists = rows.some((row) => Number(row?.id) === Number(prev));
          return exists ? prev : rows[0].id;
        });
      } else {
        setSelectedTicketId(null);
      }
    } catch (error) {
      setLoadError(error?.message || 'Unable to load support tickets.');
    }
  }, [adminId, statusFilter]);

  const loadMessages = useCallback(async (ticketId) => {
    const numericTicketId = Number(ticketId);
    if (!Number.isFinite(numericTicketId) || numericTicketId <= 0 || !Number.isFinite(adminId) || adminId <= 0) {
      setMessages([]);
      return;
    }
    try {
      const params = new URLSearchParams({
        userId: String(adminId),
        role: 'admin',
        limit: '300'
      });
      const response = await fetch(buildApiUrl(`/api/support/tickets/${numericTicketId}/messages?${params.toString()}`));
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to load support chat.');
      }
      setMessages(Array.isArray(payload?.messages) ? payload.messages : []);
    } catch (error) {
      setLoadError(error?.message || 'Unable to load support chat.');
    }
  }, [adminId]);

  useEffect(() => {
    loadTickets();
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadTickets();
      }
    }, 12000);
    return () => window.clearInterval(intervalId);
  }, [loadTickets]);

  useEffect(() => {
    if (!selectedTicketId) {
      setMessages([]);
      return undefined;
    }
    loadMessages(selectedTicketId);
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadMessages(selectedTicketId);
      }
    }, 3500);
    return () => window.clearInterval(intervalId);
  }, [loadMessages, selectedTicketId]);

  const handleUpdateStatus = async () => {
    const ticketId = Number(selectedTicketId);
    if (!Number.isFinite(ticketId) || ticketId <= 0 || !selectedStatus || isUpdatingStatus) {
      return;
    }
    try {
      setIsUpdatingStatus(true);
      setLoadError('');
      const response = await fetch(buildApiUrl(`/api/support/tickets/${ticketId}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: adminId,
          role: 'admin',
          status: selectedStatus
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to update ticket status.');
      }
      await loadTickets();
    } catch (error) {
      setLoadError(error?.message || 'Unable to update ticket status.');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleSendReply = async () => {
    const ticketId = Number(selectedTicketId);
    const content = String(reply || '').trim();
    if (!Number.isFinite(ticketId) || ticketId <= 0 || !content || isSendingReply) {
      return;
    }
    try {
      setIsSendingReply(true);
      setLoadError('');
      const response = await fetch(buildApiUrl(`/api/support/tickets/${ticketId}/messages`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: adminId,
          role: 'admin',
          message: content
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to send reply.');
      }
      setReply('');
      await Promise.all([loadMessages(ticketId), loadTickets()]);
    } catch (error) {
      setLoadError(error?.message || 'Unable to send reply.');
    } finally {
      setIsSendingReply(false);
    }
  };

  return (
    <div className="bg-card rounded-xl shadow-elevation-sm border border-border overflow-hidden">
      <div className="p-4 md:p-6 border-b border-border">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <Icon name="Headphones" size={20} color="var(--color-primary)" />
            </div>
            <div>
              <h3 className="text-base md:text-lg font-semibold text-foreground">Support Tickets</h3>
              <p className="text-xs md:text-sm text-muted-foreground">Handle customer issues and live support chat.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">Filter</label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event?.target?.value || 'open')}
              className="h-9 rounded-lg border border-border bg-background px-2.5 text-xs text-foreground"
            >
              <option value="all">All</option>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
        </div>
        {loadError ? (
          <p className="mt-3 text-xs text-error">{loadError}</p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 min-h-[520px]">
        <div className="border-r border-border p-4 space-y-2 max-h-[640px] overflow-y-auto">
          {tickets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No support tickets for this filter.</p>
          ) : tickets.map((ticket) => {
            const isActive = Number(ticket?.id) === Number(selectedTicketId);
            const statusCode = String(ticket?.status || '').trim().toLowerCase();
            return (
              <button
                key={ticket?.id}
                type="button"
                onClick={() => setSelectedTicketId(ticket?.id)}
                className={`w-full rounded-lg border p-3 text-left transition-smooth ${
                  isActive ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-semibold text-foreground line-clamp-1">{ticket?.subject || 'Ticket'}</p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${STATUS_STYLES[statusCode] || STATUS_STYLES.open}`}>
                    {toStatusLabel(statusCode)}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground line-clamp-1">{ticket?.customerName || 'Customer'}</p>
                <p className="text-[11px] text-muted-foreground line-clamp-1">{ticket?.lastMessagePreview || ticket?.description || ''}</p>
              </button>
            );
          })}
        </div>

        <div className="lg:col-span-2 p-4 md:p-6">
          {selectedTicket ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-border p-3">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-foreground">{selectedTicket?.subject}</p>
                    <p className="text-xs text-muted-foreground">
                      Customer: {selectedTicket?.customerName || 'Customer'}
                      {selectedTicket?.bookingCode ? ` • Booking ${selectedTicket.bookingCode}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedStatus}
                      onChange={(event) => setSelectedStatus(event?.target?.value || 'open')}
                      className="h-9 rounded-lg border border-border bg-background px-2.5 text-xs text-foreground"
                    >
                      {STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleUpdateStatus}
                      disabled={isUpdatingStatus}
                    >
                      {isUpdatingStatus ? 'Updating...' : 'Update'}
                    </Button>
                  </div>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{selectedTicket?.description}</p>
                {selectedTicket?.imageUrl ? (
                  <a
                    href={selectedTicket.imageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 mt-2 text-xs text-primary hover:underline"
                  >
                    <Icon name="Image" size={12} />
                    View attachment
                  </a>
                ) : null}
              </div>

              <div className="rounded-lg border border-border p-3">
                <p className="text-sm font-semibold text-foreground mb-2">Live Chat</p>
                <div className="max-h-72 overflow-y-auto rounded-md border border-border bg-background p-2 space-y-2">
                  {messages.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">No chat messages yet.</p>
                  ) : messages.map((message) => {
                    const isAdminMessage = String(message?.senderRole || '').trim().toLowerCase() === 'admin';
                    return (
                      <div key={message?.id} className={`flex ${isAdminMessage ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] rounded-md px-2.5 py-1.5 text-xs ${
                          isAdminMessage ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                        }`}>
                          <p className="whitespace-pre-wrap break-words">{message?.message}</p>
                          <p className={`mt-1 text-[10px] ${isAdminMessage ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                            {message?.senderName || message?.senderRole} • {message?.createdAt}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <Input
                    type="text"
                    value={reply}
                    onChange={(event) => setReply(event?.target?.value || '')}
                    placeholder="Reply to customer..."
                    className="flex-1"
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        handleSendReply();
                      }
                    }}
                  />
                  <Button
                    variant="default"
                    size="sm"
                    iconName="Send"
                    onClick={handleSendReply}
                    disabled={!reply.trim() || isSendingReply}
                  >
                    {isSendingReply ? 'Sending...' : 'Send'}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              Select a support ticket to review and reply.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SupportTicketsPanel;
