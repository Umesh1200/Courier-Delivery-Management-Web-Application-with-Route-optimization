import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import { buildApiUrl } from '../../../utils/api';

const QUICK_ACTIONS = [
  {
    key: 'report_issue',
    icon: 'AlertCircle',
    iconColor: 'var(--color-warning)',
    title: 'Report an Issue',
    subtitle: 'Package damaged or missing',
    defaultSubject: 'Package damaged or missing'
  },
  {
    key: 'change_delivery_address',
    icon: 'MapPin',
    iconColor: 'var(--color-accent)',
    title: 'Change Delivery Address',
    subtitle: 'Update delivery location',
    defaultSubject: 'Change delivery address request'
  },
  {
    key: 'reschedule_delivery',
    icon: 'Clock',
    iconColor: 'var(--color-secondary)',
    title: 'Reschedule Delivery',
    subtitle: 'Choose a different time',
    defaultSubject: 'Reschedule delivery request'
  }
];

const STATUS_STYLES = {
  open: 'bg-warning/15 text-warning border-warning/30',
  in_progress: 'bg-primary/15 text-primary border-primary/30',
  resolved: 'bg-success/15 text-success border-success/30',
  closed: 'bg-muted text-muted-foreground border-border'
};

const toStatusLabel = (status) => String(status || '').replaceAll('_', ' ') || 'open';

const SupportPanel = ({ bookingId = null, bookingCode = '' }) => {
  const userId = Number(localStorage.getItem('userId') || 0);
  const userRole = String(localStorage.getItem('userRole') || '').trim().toLowerCase();
  const canUseSupport = Number.isFinite(userId) && userId > 0 && userRole === 'customer';
  const [tickets, setTickets] = useState([]);
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chatMessage, setChatMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isCreatingTicket, setIsCreatingTicket] = useState(false);
  const [isStartingLiveChat, setIsStartingLiveChat] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
  const [ticketForm, setTicketForm] = useState({
    category: 'report_issue',
    subject: '',
    description: '',
    imageDataUrl: '',
    imageName: ''
  });

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => Number(ticket?.id) === Number(selectedTicketId)) || null,
    [selectedTicketId, tickets]
  );
  const canCloseLiveChat = useMemo(() => {
    const category = String(selectedTicket?.category || '').trim().toLowerCase();
    const status = String(selectedTicket?.status || '').trim().toLowerCase();
    return category === 'live_chat' && ['open', 'in_progress'].includes(status);
  }, [selectedTicket?.category, selectedTicket?.status]);

  const loadTickets = useCallback(async () => {
    if (!canUseSupport) {
      return;
    }
    try {
      setLoadError('');
      const params = new URLSearchParams({
        userId: String(userId),
        role: 'customer',
        limit: '50'
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
          const hasPrev = rows.some((row) => Number(row?.id) === Number(prev));
          return hasPrev ? prev : rows[0].id;
        });
      } else {
        setSelectedTicketId(null);
      }
    } catch (error) {
      setLoadError(error?.message || 'Unable to load support tickets.');
    }
  }, [canUseSupport, userId]);

  const loadMessages = useCallback(async (ticketId) => {
    const numericTicketId = Number(ticketId);
    if (!canUseSupport || !Number.isFinite(numericTicketId) || numericTicketId <= 0) {
      setMessages([]);
      return;
    }
    try {
      const params = new URLSearchParams({
        userId: String(userId),
        role: 'customer',
        limit: '300'
      });
      const response = await fetch(buildApiUrl(`/api/support/tickets/${numericTicketId}/messages?${params.toString()}`));
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to load ticket chat.');
      }
      setMessages(Array.isArray(payload?.messages) ? payload.messages : []);
    } catch (error) {
      setLoadError(error?.message || 'Unable to load ticket chat.');
    }
  }, [canUseSupport, userId]);

  useEffect(() => {
    if (!canUseSupport) {
      return undefined;
    }
    loadTickets();
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadTickets();
      }
    }, 10000);
    return () => window.clearInterval(intervalId);
  }, [canUseSupport, loadTickets]);

  useEffect(() => {
    if (!canUseSupport || !selectedTicketId) {
      setMessages([]);
      return undefined;
    }
    loadMessages(selectedTicketId);
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadMessages(selectedTicketId);
      }
    }, 3000);
    return () => window.clearInterval(intervalId);
  }, [canUseSupport, loadMessages, selectedTicketId]);

  const openTicketModal = (action) => {
    const actionMeta = QUICK_ACTIONS.find((item) => item.key === action) || QUICK_ACTIONS[0];
    setTicketForm({
      category: actionMeta.key,
      subject: actionMeta.defaultSubject,
      description: '',
      imageDataUrl: '',
      imageName: ''
    });
    setIsTicketModalOpen(true);
  };

  const handleTicketImageChange = (event) => {
    const file = event?.target?.files?.[0];
    if (!file) {
      setTicketForm((prev) => ({ ...prev, imageDataUrl: '', imageName: '' }));
      return;
    }
    if (!String(file.type || '').startsWith('image/')) {
      setLoadError('Only image files are allowed.');
      return;
    }
    if (Number(file.size) > 5 * 1024 * 1024) {
      setLoadError('Image must be under 5 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setTicketForm((prev) => ({
        ...prev,
        imageDataUrl: String(reader.result || ''),
        imageName: String(file.name || 'attachment')
      }));
    };
    reader.readAsDataURL(file);
  };

  const createTicket = async ({ category, subject, description, imageDataUrl = '' }) => {
    const response = await fetch(buildApiUrl('/api/support/tickets'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        role: 'customer',
        bookingId: Number(bookingId) > 0 ? Number(bookingId) : null,
        bookingCode: String(bookingCode || '').trim() || null,
        category,
        subject,
        description,
        imageDataUrl
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || 'Unable to create support ticket.');
    }
    return payload?.ticket || null;
  };

  const handleSubmitTicket = async (event) => {
    event.preventDefault();
    if (!canUseSupport || isCreatingTicket) {
      return;
    }
    const subject = String(ticketForm?.subject || '').trim();
    const description = String(ticketForm?.description || '').trim();
    if (!subject || !description) {
      setLoadError('Subject and description are required.');
      return;
    }
    try {
      setIsCreatingTicket(true);
      setLoadError('');
      const ticket = await createTicket({
        category: ticketForm.category,
        subject,
        description,
        imageDataUrl: ticketForm.imageDataUrl
      });
      setIsTicketModalOpen(false);
      await loadTickets();
      if (ticket?.id) {
        setSelectedTicketId(ticket.id);
      }
    } catch (error) {
      setLoadError(error?.message || 'Unable to create support ticket.');
    } finally {
      setIsCreatingTicket(false);
    }
  };

  const handleStartLiveChat = async () => {
    if (!canUseSupport || isStartingLiveChat) {
      return;
    }
    const existingLiveTicket = tickets.find((ticket) => {
      const category = String(ticket?.category || '').trim().toLowerCase();
      const status = String(ticket?.status || '').trim().toLowerCase();
      return category === 'live_chat' && ['open', 'in_progress'].includes(status);
    });
    if (existingLiveTicket?.id) {
      setSelectedTicketId(existingLiveTicket.id);
      return;
    }

    try {
      setIsStartingLiveChat(true);
      setLoadError('');
      const ticket = await createTicket({
        category: 'live_chat',
        subject: `Live chat request${bookingCode ? ` - ${bookingCode}` : ''}`,
        description: 'Customer started a live support chat session.'
      });
      await loadTickets();
      if (ticket?.id) {
        setSelectedTicketId(ticket.id);
      }
    } catch (error) {
      setLoadError(error?.message || 'Unable to start live chat.');
    } finally {
      setIsStartingLiveChat(false);
    }
  };

  const handleCloseLiveChat = async () => {
    const ticketId = Number(selectedTicketId);
    if (!canUseSupport || !canCloseLiveChat || !Number.isFinite(ticketId) || ticketId <= 0) {
      return;
    }
    try {
      setLoadError('');
      const response = await fetch(buildApiUrl(`/api/support/tickets/${ticketId}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          role: 'customer',
          status: 'closed'
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to close live chat.');
      }
      await Promise.all([loadTickets(), loadMessages(ticketId)]);
    } catch (error) {
      setLoadError(error?.message || 'Unable to close live chat.');
    }
  };

  const handleSendMessage = async () => {
    const content = String(chatMessage || '').trim();
    const ticketId = Number(selectedTicketId);
    if (!content || !canUseSupport || !Number.isFinite(ticketId) || ticketId <= 0 || isSending) {
      return;
    }
    try {
      setIsSending(true);
      setLoadError('');
      const response = await fetch(buildApiUrl(`/api/support/tickets/${ticketId}/messages`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          role: 'customer',
          message: content
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to send support message.');
      }
      setChatMessage('');
      await Promise.all([loadMessages(ticketId), loadTickets()]);
    } catch (error) {
      setLoadError(error?.message || 'Unable to send support message.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="bg-card rounded-xl shadow-elevation-md overflow-hidden">
      <div className="p-4 md:p-6 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
            <Icon name="Headphones" size={20} color="var(--color-primary)" />
          </div>
          <div>
            <h3 className="text-base md:text-lg font-semibold text-foreground">Support & Help</h3>
            <p className="text-xs md:text-sm text-muted-foreground">Raise tickets and chat with admin support</p>
          </div>
        </div>
      </div>

      <div className="p-4 md:p-6 space-y-4">
        {canUseSupport ? null : (
          <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
            Sign in as a customer to create support tickets and chat with admin support.
          </div>
        )}
        {loadError ? (
          <div className="rounded-lg border border-error/30 bg-error/10 p-3 text-xs text-error">
            {loadError}
          </div>
        ) : null}

        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground">Quick Actions</p>
          <div className="space-y-2">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.key}
                type="button"
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted transition-smooth text-left"
                onClick={() => openTicketModal(action.key)}
                disabled={!canUseSupport}
              >
                <div className="w-8 h-8 rounded-md bg-muted/80 flex items-center justify-center flex-shrink-0">
                  <Icon name={action.icon} size={16} color={action.iconColor} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{action.title}</p>
                  <p className="text-xs text-muted-foreground">{action.subtitle}</p>
                </div>
                <Icon name="ChevronRight" size={16} color="var(--color-muted-foreground)" />
              </button>
            ))}
          </div>
        </div>

        <div className="border border-border rounded-lg p-3 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 inline-flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center">
                <Icon name="Headphones" size={14} color="var(--color-primary)" />
              </div>
              <p className="text-sm font-semibold text-foreground">Live Chat</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end sm:flex-shrink-0">
            <Button
              variant="default"
              size="sm"
              iconName="MessageCircle"
              iconPosition="left"
              onClick={handleStartLiveChat}
              disabled={!canUseSupport || isStartingLiveChat}
              title="Start live support chat"
            >
              {isStartingLiveChat ? '...' : 'Start'}
            </Button>
            {canCloseLiveChat ? (
              <Button
                variant="outline"
                size="sm"
                iconName="XCircle"
                iconPosition="left"
                onClick={handleCloseLiveChat}
                disabled={!canUseSupport}
                title="Close live support chat"
              >
                Close
              </Button>
            ) : null}
            </div>
          </div>

          <div className="space-y-2">
            {tickets.slice(0, 6).map((ticket) => {
              const isActive = Number(ticket?.id) === Number(selectedTicketId);
              const statusCode = String(ticket?.status || '').trim().toLowerCase();
              return (
                <button
                  key={ticket?.id}
                  type="button"
                  onClick={() => setSelectedTicketId(ticket?.id)}
                  className={`w-full rounded-lg border p-2.5 text-left transition-smooth ${
                    isActive ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-medium text-foreground line-clamp-1">{ticket?.subject || 'Support Ticket'}</p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${STATUS_STYLES[statusCode] || STATUS_STYLES.open}`}>
                      {toStatusLabel(statusCode)}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground line-clamp-1">
                    {ticket?.lastMessagePreview || ticket?.description || 'No updates yet'}
                  </p>
                </button>
              );
            })}
            {tickets.length === 0 ? (
              <p className="text-xs text-muted-foreground">No support tickets yet.</p>
            ) : null}
          </div>

          {selectedTicket ? (
            <div className="rounded-lg border border-border p-3 space-y-3">
              <div>
                <p className="text-sm font-semibold text-foreground">{selectedTicket?.subject}</p>
                <p className="text-xs text-muted-foreground">{selectedTicket?.description}</p>
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

              <div className="max-h-48 overflow-y-auto rounded-md border border-border bg-background p-2 space-y-2">
                {messages.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">No chat messages yet.</p>
                ) : messages.map((message) => {
                  const isMine = Number(message?.senderId) === userId;
                  return (
                    <div key={message?.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] rounded-md px-2.5 py-1.5 text-xs ${
                        isMine ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                      }`}>
                        <p className="whitespace-pre-wrap break-words">{message?.message}</p>
                        <p className={`mt-1 text-[10px] ${isMine ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                          {message?.senderRole} - {message?.createdAt}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  placeholder="Type a message to admin support..."
                  value={chatMessage}
                  onChange={(event) => setChatMessage(event?.target?.value || '')}
                  className="flex-1"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      handleSendMessage();
                    }
                  }}
                />
                <Button
                  variant="default"
                  size="sm"
                  iconName="Send"
                  onClick={handleSendMessage}
                  disabled={!chatMessage.trim() || isSending}
                >
                  {isSending ? 'Sending...' : 'Send'}
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Icon name="Info" size={18} color="var(--color-primary)" className="mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground mb-1">Need Immediate Help?</p>
              <p className="text-xs text-muted-foreground mb-2">Call our 24/7 support hotline</p>
              <a href="tel:+1-800-COURIER" className="text-sm font-medium text-primary hover:underline">
                +1-800-COURIER
              </a>
            </div>
          </div>
        </div>
      </div>

      {isTicketModalOpen ? (
        <div className="fixed inset-0 z-[1300] bg-black/50 p-4 flex items-center justify-center">
          <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-elevation-md">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h4 className="text-base font-semibold text-foreground">Create Support Ticket</h4>
              <button
                type="button"
                className="p-1.5 rounded-md hover:bg-muted"
                onClick={() => setIsTicketModalOpen(false)}
              >
                <Icon name="X" size={16} />
              </button>
            </div>
            <form className="p-4 space-y-3" onSubmit={handleSubmitTicket}>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Subject</p>
                <Input
                  type="text"
                  value={ticketForm.subject}
                  onChange={(event) => setTicketForm((prev) => ({ ...prev, subject: event?.target?.value || '' }))}
                  placeholder="Ticket subject"
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Description</p>
                <textarea
                  rows={4}
                  value={ticketForm.description}
                  onChange={(event) => setTicketForm((prev) => ({ ...prev, description: event?.target?.value || '' }))}
                  placeholder="Describe your issue/request"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Attach Image (optional)</p>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleTicketImageChange}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground"
                />
                {ticketForm.imageName ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">Selected: {ticketForm.imageName}</p>
                ) : null}
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsTicketModalOpen(false)}
                  disabled={isCreatingTicket}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="default"
                  size="sm"
                  disabled={isCreatingTicket}
                >
                  {isCreatingTicket ? 'Creating...' : 'Create Ticket'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default SupportPanel;
