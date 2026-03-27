import React from 'react';
import Icon from '../../../components/AppIcon';

const FeaturesSection = () => {
  const features = [
    {
      id: 1,
      icon: "MapPin",
      title: "Real-Time Tracking",
      description: "Monitor your package location with live GPS tracking and receive instant updates at every delivery milestone.",
      color: "var(--color-primary)"
    },
    {
      id: 2,
      icon: "Calendar",
      title: "Flexible Scheduling",
      description: "Choose your preferred pickup and delivery time slots that fit your schedule perfectly.",
      color: "var(--color-accent)"
    },
    {
      id: 3,
      icon: "Shield",
      title: "Secure Delivery",
      description: "Every package is insured and handled with care. Signature confirmation and photo proof included.",
      color: "var(--color-success)"
    },
    {
      id: 4,
      icon: "Clock",
      title: "24/7 Support",
      description: "Our customer support team is always available to assist you with any questions or concerns.",
      color: "var(--color-warning)"
    },
    {
      id: 5,
      icon: "NepalRupee",
      title: "Transparent Pricing",
      description: "No hidden fees. Get instant quotes and pay only for what you need with our clear pricing structure.",
      color: "var(--color-primary)"
    },
    {
      id: 6,
      icon: "Users",
      title: "Verified Couriers",
      description: "All our delivery personnel are background-checked, trained professionals you can trust.",
      color: "var(--color-accent)"
    }
  ];

  return (
    <section className="py-12 md:py-16 lg:py-24 bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-8 md:mb-12 lg:mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-accent/10 rounded-full text-sm md:text-base font-medium text-accent mb-4">
            <Icon name="Star" size={16} />
            <span>Why Choose Us</span>
          </div>
          <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-foreground mb-4">
            Features That Make Us Stand Out
          </h2>
          <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto">
            Experience the difference with our comprehensive platform designed for seamless courier management.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
          {features?.map((feature) => (
            <div 
              key={feature?.id}
              className="group bg-card rounded-2xl p-6 md:p-8 shadow-elevation-sm hover:shadow-elevation-lg transition-all duration-300 hover:-translate-y-1"
            >
              {/* Icon */}
              <div 
                className="w-14 h-14 md:w-16 md:h-16 rounded-xl flex items-center justify-center mb-4 md:mb-6 group-hover:scale-110 transition-transform duration-300"
                style={{ backgroundColor: `${feature?.color}15` }}
              >
                <Icon name={feature?.icon} size={28} color={feature?.color} />
              </div>

              {/* Content */}
              <h3 className="text-lg md:text-xl font-semibold text-foreground mb-3">
                {feature?.title}
              </h3>
              <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
                {feature?.description}
              </p>
            </div>
          ))}
        </div>

        {/* CTA Section */}
        <div className="mt-12 md:mt-16 text-center">
          <div className="inline-flex flex-col sm:flex-row items-center gap-4 bg-card rounded-2xl p-6 md:p-8 shadow-elevation-md">
            <div className="flex-1 text-center sm:text-left">
              <h3 className="text-xl md:text-2xl font-bold text-foreground mb-2">
                Ready to Get Started?
              </h3>
              <p className="text-sm md:text-base text-muted-foreground">
                Join thousands of satisfied customers using CourierFlow today.
              </p>
            </div>
            <button className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors duration-200">
              <span>Start Shipping</span>
              <Icon name="ArrowRight" size={20} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;

