import React from 'react';
import Icon from '../../../components/AppIcon';

const QuickActionButton = ({ icon, label, onClick, color = 'var(--color-primary)' }) => {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2 md:gap-3 p-4 md:p-5 bg-card rounded-xl border border-border hover:shadow-elevation-md hover:border-primary/20 transition-smooth group"
    >
      <div
        className="w-12 h-12 md:w-14 md:h-14 lg:w-16 lg:h-16 rounded-xl flex items-center justify-center group-hover:scale-110 transition-smooth"
        style={{ backgroundColor: `${color}15` }}
      >
        <Icon
          name={icon}
          size={24}
          color={color}
          className="md:w-7 md:h-7 lg:w-8 lg:h-8"
        />
      </div>
      <span className="text-xs md:text-sm font-medium text-foreground text-center">{label}</span>
    </button>
  );
};

export default QuickActionButton;