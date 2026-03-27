import React, { useState } from 'react';
import Icon from '../AppIcon';
import Button from './Button';

const RatingModal = ({ isOpen, title, onClose, onSubmit }) => {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');

  const handleClose = () => {
    setRating(0);
    setComment('');
    onClose?.();
  };

  const handleSubmit = () => {
    if (rating <= 0) {
      return;
    }
    onSubmit?.({ rating, comment });
    setRating(0);
    setComment('');
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md bg-card rounded-xl shadow-elevation-md border border-border">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <p className="text-xs text-muted-foreground">Rate</p>
            <h3 className="text-base md:text-lg font-semibold text-foreground">{title}</h3>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg hover:bg-muted transition-smooth"
            aria-label="Close rating"
          >
            <Icon name="X" size={18} />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <p className="text-sm text-foreground font-medium mb-2">Your Rating</p>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`w-10 h-10 rounded-full border border-border flex items-center justify-center ${
                    rating >= value ? 'bg-warning/15 text-warning' : 'bg-muted text-muted-foreground'
                  }`}
                  onClick={() => setRating(value)}
                >
                  <Icon name="Star" size={18} />
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm text-foreground font-medium">Comment (optional)</label>
            <textarea
              className="w-full mt-2 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary"
              rows="3"
              placeholder="Share your experience..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" fullWidth onClick={handleClose}>
              Cancel
            </Button>
            <Button variant="default" fullWidth onClick={handleSubmit} disabled={rating <= 0}>
              Submit Rating
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RatingModal;
