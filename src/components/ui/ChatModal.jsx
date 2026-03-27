import React, { useEffect, useRef, useState } from 'react';
import Icon from '../AppIcon';
import Button from './Button';

const MAX_CHAT_HISTORY_ITEMS = 300;

const ChatModal = ({
  isOpen,
  onClose,
  bookingId,
  title = 'Message',
  currentUserId,
  currentUserRole,
  canSend = true,
  disabledReason = '',
  legLabel = '',
  onMessagesChange = null,
  refreshMs = 2000,
  recipientId = null,
  recipientRole = '',
  layout = 'modal',
  queryParams = null,
  sendPayload = null
}) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef(null);
  const pollingRef = useRef(null);
  const lastIdRef = useRef(0);
  const requestTokenRef = useRef(0);
  const pendingControllersRef = useRef(new Set());
  const isPollingFetchInFlightRef = useRef(false);

  const resetState = () => {
    setMessages([]);
    setInput('');
    setIsSending(false);
    setError('');
    lastIdRef.current = 0;
    isPollingFetchInFlightRef.current = false;
  };

  const abortPendingRequests = () => {
    pendingControllersRef.current.forEach((controller) => controller.abort());
    pendingControllersRef.current.clear();
  };

  const scrollToBottom = () => {
    if (scrollRef?.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  const mergeUniqueMessages = (previous, incoming, replace = false) => {
    const baseItems = Array.isArray(replace ? incoming : previous) ? (replace ? incoming : previous) : [];
    const mergedItems = replace ? [...baseItems] : [...baseItems, ...(Array.isArray(incoming) ? incoming : [])];
    const seenKeys = new Set();
    const deduped = [];

    for (let index = mergedItems.length - 1; index >= 0; index -= 1) {
      const item = mergedItems[index];
      const itemId = Number(item?.id);
      const dedupeKey = Number.isFinite(itemId) && itemId > 0
        ? `id:${itemId}`
        : `fallback:${String(item?.senderId || '')}:${String(item?.senderRole || '')}:${String(item?.createdAt || '')}:${String(item?.message || '')}`;
      if (seenKeys.has(dedupeKey)) {
        continue;
      }
      seenKeys.add(dedupeKey);
      deduped.push(item);
    }

    deduped.reverse();
    if (deduped.length > MAX_CHAT_HISTORY_ITEMS) {
      return deduped.slice(deduped.length - MAX_CHAT_HISTORY_ITEMS);
    }
    return deduped;
  };

  const fetchMessages = async (afterId = 0, requestToken = requestTokenRef.current) => {
    if (!bookingId || !currentUserId || !currentUserRole) {
      return;
    }
    const numericAfterId = Number(afterId) || 0;
    const isIncrementalFetch = numericAfterId > 0;
    if (isIncrementalFetch && isPollingFetchInFlightRef.current) {
      return;
    }
    if (isIncrementalFetch) {
      isPollingFetchInFlightRef.current = true;
    }
    const requestController = new AbortController();
    pendingControllersRef.current.add(requestController);
    try {
      const params = new URLSearchParams({
        bookingId: String(bookingId),
        userId: String(currentUserId),
        role: String(currentUserRole),
        afterId: String(numericAfterId),
        limit: '200'
      });
      if (queryParams && typeof queryParams === 'object') {
        Object.entries(queryParams).forEach(([key, value]) => {
          if (value === undefined || value === null) {
            return;
          }
          const normalizedValue = String(value).trim();
          if (normalizedValue === '') {
            return;
          }
          params.set(String(key), normalizedValue);
        });
      }
      const res = await fetch(`http://localhost:8000/api/messages?${params.toString()}`, {
        signal: requestController.signal
      });
      const payload = await res.json();
      if (requestToken !== requestTokenRef.current) {
        return;
      }
      if (!res.ok) {
        throw new Error(payload?.error || 'Unable to load messages.');
      }
      const nextMessages = Array.isArray(payload?.messages) ? payload.messages : [];
      if (nextMessages.length > 0) {
        setMessages((prev) => mergeUniqueMessages(prev, nextMessages, numericAfterId <= 0));
        const newest = nextMessages[nextMessages.length - 1];
        lastIdRef.current = newest?.id || numericAfterId;
      } else if (numericAfterId === 0) {
        setMessages([]);
      }
    } catch (err) {
      if (err?.name === 'AbortError' || requestToken !== requestTokenRef.current) {
        return;
      }
      setError(err?.message || 'Unable to load messages.');
    } finally {
      if (isIncrementalFetch) {
        isPollingFetchInFlightRef.current = false;
      }
      pendingControllersRef.current.delete(requestController);
    }
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || !bookingId || !currentUserId || !currentUserRole) {
      return;
    }
    const activeToken = requestTokenRef.current;
    const isAdmin = String(currentUserRole || '').trim().toLowerCase() === 'admin';
    const safeRecipientId = Number(recipientId);
    const safeRecipientRole = String(recipientRole || '').trim().toLowerCase();
    if (isAdmin && (!Number.isFinite(safeRecipientId) || safeRecipientId <= 0 || !['customer', 'courier'].includes(safeRecipientRole))) {
      setError('Select a valid message recipient.');
      return;
    }
    setIsSending(true);
    setError('');
    try {
      const res = await fetch('http://localhost:8000/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId,
          userId: Number(currentUserId),
          role: currentUserRole,
          message: trimmed,
          ...(isAdmin ? { recipientId: safeRecipientId, recipientRole: safeRecipientRole } : {}),
          ...(sendPayload && typeof sendPayload === 'object' ? sendPayload : {})
        })
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.error || 'Unable to send message.');
      }
      const sent = payload?.message;
      if (activeToken !== requestTokenRef.current) {
        return;
      }
      if (sent) {
        setMessages((prev) => mergeUniqueMessages(prev, [sent], false));
        lastIdRef.current = sent?.id || lastIdRef.current;
      }
      setInput('');
    } catch (err) {
      if (activeToken !== requestTokenRef.current) {
        return;
      }
      setError(err?.message || 'Unable to send message.');
    } finally {
      if (activeToken === requestTokenRef.current) {
        setIsSending(false);
      }
    }
  };

  useEffect(() => {
    if (!isOpen) {
      requestTokenRef.current += 1;
      abortPendingRequests();
      resetState();
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    requestTokenRef.current += 1;
    const effectToken = requestTokenRef.current;
    abortPendingRequests();
    resetState();
    fetchMessages(0, effectToken);
    pollingRef.current = setInterval(() => {
      fetchMessages(lastIdRef.current || 0, effectToken);
    }, Math.max(1200, Number(refreshMs) || 2000));

    return () => {
      requestTokenRef.current += 1;
      abortPendingRequests();
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [isOpen, bookingId, currentUserId, currentUserRole, refreshMs, queryParams]);

  useEffect(() => {
    if (!isOpen || typeof onMessagesChange !== 'function') {
      return;
    }
    const lastMessageId = messages.length > 0 ? Number(messages[messages.length - 1]?.id) || 0 : 0;
    onMessagesChange({
      bookingId: Number(bookingId),
      messages,
      lastMessageId
    });
  }, [bookingId, isOpen, messages, onMessagesChange]);

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  if (!isOpen) {
    return null;
  }

  const isSidePanel = layout === 'side-panel';
  const wrapperClassName = isSidePanel
    ? 'fixed left-0 right-0 bottom-0 top-[60px] z-[1200]'
    : 'fixed inset-0 z-[1200] flex items-center justify-center bg-black/50 p-4';
  const panelClassName = isSidePanel
    ? 'absolute inset-y-0 right-0 w-full max-w-md bg-card rounded-none md:rounded-l-xl shadow-elevation-md border-l border-border flex flex-col max-h-full'
    : 'w-full max-w-lg bg-card rounded-xl shadow-elevation-md border border-border flex flex-col max-h-[80vh]';

  return (
    <div className={wrapperClassName}>
      {isSidePanel ? (
        <button
          type="button"
          className="absolute inset-0 bg-black/35"
          aria-label="Close chat"
          onClick={onClose}
        />
      ) : null}
      <div className={panelClassName}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <p className="text-sm text-muted-foreground">Chat</p>
            <h3 className="text-base md:text-lg font-semibold text-foreground">{title}</h3>
            {legLabel ? (
              <p className="text-[11px] text-muted-foreground mt-0.5">{legLabel}</p>
            ) : null}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-muted transition-smooth"
            aria-label="Close chat"
          >
            <Icon name="X" size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3" ref={scrollRef}>
          {error && (
            <div className="text-xs text-error bg-error/10 border border-error/20 rounded-lg p-2">
              {error}
            </div>
          )}
          {messages.length === 0 && !error && (
            <div className="text-sm text-muted-foreground text-center py-6">
              No messages yet. Say hello!
            </div>
          )}
          {messages.map((msg) => {
            const isMine = Number(msg?.senderId) === Number(currentUserId);
            return (
              <div
                key={msg?.id}
                className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                    isMine
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground'
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{msg?.message}</p>
                  <p className={`mt-1 text-[10px] ${isMine ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                    {msg?.createdAt}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="p-4 border-t border-border">
          {!canSend && disabledReason ? (
            <div className="mb-2 rounded-md border border-warning/30 bg-warning/10 px-2.5 py-2 text-xs text-warning">
              {disabledReason}
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={canSend ? 'Type a message...' : 'Messaging is disabled for this stage'}
              className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              disabled={!canSend}
              onKeyDown={(e) => {
                if (canSend && e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <Button
              variant="default"
              size="sm"
              iconName="Send"
              onClick={handleSend}
              disabled={!canSend || isSending || !input.trim()}
            >
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatModal;
