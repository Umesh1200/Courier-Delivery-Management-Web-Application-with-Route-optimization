import React from 'react';
import Icon from '../../../components/AppIcon';
import Image from '../../../components/AppImage';
import Button from '../../../components/ui/Button';

const DeliveryProof = ({ proof }) => {
  if (!proof) {
    return (
      <div id="delivery-proof" className="bg-card rounded-xl shadow-elevation-md p-4 md:p-6">
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center">
            <Icon name="FileCheck" size={24} color="var(--color-muted-foreground)" />
          </div>
          <p className="text-sm text-muted-foreground">Delivery proof will be available after completion</p>
        </div>
      </div>
    );
  }

  const handleDownload = (url) => {
    if (!url) {
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div id="delivery-proof" className="bg-card rounded-xl shadow-elevation-md overflow-hidden">
      <div className="p-4 md:p-6 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-success/10 rounded-lg flex items-center justify-center">
            <Icon name="FileCheck" size={20} color="var(--color-success)" />
          </div>
          <div>
            <h3 className="text-base md:text-lg font-semibold text-foreground">Delivery Proof</h3>
            <p className="text-xs md:text-sm text-muted-foreground">Completed on {proof?.completedAt}</p>
          </div>
        </div>
      </div>
      <div className="p-4 md:p-6 space-y-6">
        {proof?.photo && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-foreground">Delivery Photo</p>
              <Button
                variant="ghost"
                size="sm"
                iconName="Download"
                iconPosition="left"
                onClick={() => handleDownload(proof?.photo?.url)}
              >
                Download
              </Button>
            </div>
            <div className="relative aspect-video rounded-lg overflow-hidden bg-muted">
              <Image
                src={proof?.photo?.url}
                alt={proof?.photo?.alt}
                className="w-full h-full object-cover"
              />
            </div>
            {proof?.photo?.note && (
              <p className="mt-2 text-xs text-muted-foreground">{proof?.photo?.note}</p>
            )}
          </div>
        )}

        {proof?.signature && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-foreground">Recipient Signature</p>
              <Button
                variant="ghost"
                size="sm"
                iconName="Download"
                iconPosition="left"
                onClick={() => handleDownload(proof?.signature?.url)}
              >
                Download
              </Button>
            </div>
            <div className="relative aspect-[2/1] rounded-lg overflow-hidden bg-muted border-2 border-dashed border-border">
              <Image
                src={proof?.signature?.url}
                alt={proof?.signature?.alt}
                className="w-full h-full object-contain p-4"
              />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Icon name="User" size={14} color="var(--color-primary)" />
              <span className="text-xs text-muted-foreground">Signed by: {proof?.signature?.signedBy}</span>
            </div>
          </div>
        )}

        {proof?.notes ? (
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Driver Notes</p>
            <p className="mt-1 text-sm text-foreground">{proof?.notes}</p>
          </div>
        ) : null}

        <div className="bg-success/10 border border-success/20 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-success/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <Icon name="CheckCircle2" size={16} color="var(--color-success)" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground mb-1">Delivery Confirmed</p>
              <p className="text-xs text-muted-foreground">Package successfully delivered and verified</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeliveryProof;
