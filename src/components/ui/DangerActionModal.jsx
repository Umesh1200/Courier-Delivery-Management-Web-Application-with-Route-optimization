import React, { useEffect, useMemo, useState } from 'react';
import Icon from '../AppIcon';
import Button from './Button';

const DangerActionModal = ({
  isOpen = false,
  title = 'Confirm Action',
  subtitle = '',
  reasonLabel = 'Reason',
  reasonOptions = [],
  reasonValue = '',
  onReasonChange,
  requireReason = true,
  showReasonField = true,
  notesValue = '',
  onNotesChange,
  notesLabel = 'Notes',
  notesPlaceholder = 'Optional notes for audit log',
  stepOneNotice = '',
  continueLabel = 'Continue',
  finalConfirmLabel = 'Confirm',
  confirmPrompt = 'Are you sure?',
  finalCheckLabel = 'I understand this action will be logged and reviewed.',
  isSubmitting = false,
  submitError = '',
  disableContinue = false,
  onSubmit,
  onClose,
  stepOneFooter = null
}) => {
  const [step, setStep] = useState(1);
  const [isSecondConfirmChecked, setIsSecondConfirmChecked] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setStep(1);
      setIsSecondConfirmChecked(false);
    }
  }, [isOpen]);

  const selectedReasonLabel = useMemo(() => {
    const normalized = String(reasonValue || '').trim().toLowerCase();
    if (!normalized) {
      return '';
    }
    const match = (Array.isArray(reasonOptions) ? reasonOptions : []).find(
      (option) => String(option?.value || '').trim().toLowerCase() === normalized
    );
    return match?.label || '';
  }, [reasonOptions, reasonValue]);

  const hasReasonValue = Boolean(String(reasonValue || '').trim());
  const canContinue = (
    showReasonField
      ? (requireReason ? hasReasonValue : true)
      : true
  ) && !disableContinue;
  const canSubmit = canContinue && isSecondConfirmChecked && !isSubmitting;

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-elevation-lg">
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-error">Destructive Action</p>
            <h3 className="text-base font-semibold text-foreground">{title}</h3>
            {subtitle ? (
              <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground transition-smooth hover:bg-muted hover:text-foreground"
            aria-label="Close action modal"
            disabled={isSubmitting}
          >
            <Icon name="X" size={16} />
          </button>
        </div>

        <div className="space-y-3 px-4 py-4">
          {step === 1 ? (
            <>
              <div className="rounded-lg border border-error/20 bg-error/10 p-2.5 text-xs text-error">
                {stepOneNotice || (showReasonField
                  ? (requireReason
                    ? 'Select a reason to continue. This action is intentionally hard to trigger.'
                    : 'Review details and continue. This action is intentionally hard to trigger.')
                  : 'Review details and continue. This action is intentionally hard to trigger.')}
              </div>
              {showReasonField ? (
                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">{reasonLabel}</label>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    value={reasonValue}
                    onChange={(event) => onReasonChange?.(event.target.value)}
                    disabled={isSubmitting}
                  >
                    <option value="">Select reason</option>
                    {(Array.isArray(reasonOptions) ? reasonOptions : []).map((option) => (
                      <option key={option?.value} value={option?.value}>
                        {option?.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">{notesLabel}</label>
                <textarea
                  rows={3}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder={notesPlaceholder}
                  value={notesValue}
                  onChange={(event) => onNotesChange?.(event.target.value)}
                  disabled={isSubmitting}
                />
              </div>
              {stepOneFooter}
              {submitError ? (
                <p className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
                  {submitError}
                </p>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  iconName="AlertTriangle"
                  iconPosition="left"
                  onClick={() => setStep(2)}
                  disabled={!canContinue || isSubmitting}
                >
                  {continueLabel}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-lg border border-error/20 bg-error/10 p-3">
                <p className="text-sm font-semibold text-foreground">{confirmPrompt}</p>
                {showReasonField ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Reason: <span className="font-medium text-foreground">{selectedReasonLabel || reasonValue}</span>
                  </p>
                ) : null}
                {notesValue ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Notes: <span className="font-medium text-foreground">{notesValue}</span>
                  </p>
                ) : null}
              </div>

              <label className="flex items-start gap-2 rounded-md border border-border bg-muted/20 p-2.5">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-input"
                  checked={isSecondConfirmChecked}
                  onChange={(event) => setIsSecondConfirmChecked(event.target.checked)}
                  disabled={isSubmitting}
                />
                <span className="text-xs text-foreground">{finalCheckLabel}</span>
              </label>

              {submitError ? (
                <p className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
                  {submitError}
                </p>
              ) : null}

              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  iconName="ArrowLeft"
                  iconPosition="left"
                  onClick={() => setStep(1)}
                  disabled={isSubmitting}
                >
                  Back
                </Button>
                <Button
                  variant="danger"
                  iconName="ShieldAlert"
                  iconPosition="left"
                  onClick={() => onSubmit?.()}
                  disabled={!canSubmit}
                >
                  {isSubmitting ? 'Submitting...' : finalConfirmLabel}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default DangerActionModal;
