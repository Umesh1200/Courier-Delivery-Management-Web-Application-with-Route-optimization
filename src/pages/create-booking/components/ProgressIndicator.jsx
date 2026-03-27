import React from 'react';
import Icon from '../../../components/AppIcon';

const ProgressIndicator = ({ currentStep, steps }) => {
  return (
    <div className="bg-card rounded-xl p-4 md:p-6 shadow-elevation-md mb-4 md:mb-6">
      <div className="flex items-center justify-between">
        {steps?.map((step, index) => (
          <React.Fragment key={step?.id}>
            <div className="flex flex-col items-center flex-1">
              <div
                className={`w-8 h-8 md:w-10 md:h-10 lg:w-12 lg:h-12 rounded-full flex items-center justify-center transition-all duration-300 ${
                  index < currentStep
                    ? 'bg-success text-success-foreground'
                    : index === currentStep
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {index < currentStep ? (
                  <Icon name="Check" size={16} />
                ) : (
                  <Icon name={step?.icon} size={16} />
                )}
              </div>
              <p className={`text-xs md:text-sm font-medium mt-2 text-center ${
                index === currentStep ? 'text-primary' : 'text-muted-foreground'
              }`}>
                {step?.label}
              </p>
            </div>
            {index < steps?.length - 1 && (
              <div className="flex-1 h-0.5 mx-2 md:mx-4">
                <div
                  className={`h-full transition-all duration-300 ${
                    index < currentStep ? 'bg-success' : 'bg-muted'
                  }`}
                />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

export default ProgressIndicator;