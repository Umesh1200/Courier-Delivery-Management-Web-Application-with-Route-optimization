import React from 'react';
import Button from '../../../components/ui/Button';
import Icon from '../../../components/AppIcon';
import Image from '../../../components/AppImage';

const CTASection = ({ onGetStarted }) => {
  return (
    <section className="py-12 md:py-16 lg:py-24 bg-gradient-to-br from-primary/10 via-background to-accent/10">
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
        <div className="bg-card rounded-3xl overflow-hidden shadow-elevation-2xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
            {/* Left Content */}
            <div className="p-8 md:p-12 lg:p-16 flex flex-col justify-center">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full text-sm md:text-base font-medium text-primary mb-6 w-fit">
                <Icon name="Rocket" size={16} />
                <span>Get Started Today</span>
              </div>

              <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-foreground mb-4">
                Ready to Transform Your Delivery Experience?
              </h2>

              <p className="text-base md:text-lg text-muted-foreground mb-8">
                Join thousands of businesses and individuals who trust CourierFlow for their delivery needs. Sign up now and get your first delivery at a special discounted rate.
              </p>

              {/* Benefits List */}
              <ul className="space-y-4 mb-8">
                {[
                "Free account setup with no hidden fees",
                "Instant access to our courier network",
                "Real-time tracking on all deliveries",
                "24/7 customer support team"]?.
                map((benefit, index) =>
                <li key={index} className="flex items-start gap-3">
                    <div className="w-6 h-6 bg-success/10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Icon name="Check" size={14} color="var(--color-success)" />
                    </div>
                    <span className="text-sm md:text-base text-foreground">{benefit}</span>
                  </li>
                )}
              </ul>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row gap-4">
                <Button
                  variant="default"
                  size="lg"
                  iconName="ArrowRight"
                  iconPosition="right"
                  onClick={onGetStarted}
                  className="w-full sm:w-auto">

                  Get Started Free
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  iconName="Phone"
                  iconPosition="left"
                  className="w-full sm:w-auto">

                  Contact Sales
                </Button>
              </div>

              {/* Trust Indicators */}
              <div className="flex items-center gap-6 mt-8 pt-8 border-t border-border">
                <div className="flex items-center gap-2">
                  <Icon name="Shield" size={20} color="var(--color-success)" />
                  <span className="text-sm text-muted-foreground">SSL Secured</span>
                </div>
                <div className="flex items-center gap-2">
                  <Icon name="Lock" size={20} color="var(--color-success)" />
                  <span className="text-sm text-muted-foreground">GDPR Compliant</span>
                </div>
              </div>
            </div>

            {/* Right Image */}
            <div className="relative h-64 md:h-80 lg:h-auto min-h-[400px]">
              <Image
                src="https://img.rocket.new/generatedImages/rocket_gen_img_12e6d83ab-1766421090986.png"
                alt="Professional business team collaborating in modern office with laptops and digital devices discussing courier delivery logistics and tracking dashboard on large screen"
                className="w-full h-full object-cover" />

              
              {/* Overlay Stats */}
              <div className="absolute inset-0 bg-gradient-to-t from-card/90 via-card/50 to-transparent flex items-end p-6 md:p-8">
                <div className="grid grid-cols-2 gap-4 w-full">
                  <div className="bg-card/80 backdrop-blur-sm rounded-xl p-4 text-center">
                    <p className="text-2xl md:text-3xl font-bold text-primary mb-1">50K+</p>
                    <p className="text-xs md:text-sm text-muted-foreground">Active Users</p>
                  </div>
                  <div className="bg-card/80 backdrop-blur-sm rounded-xl p-4 text-center">
                    <p className="text-2xl md:text-3xl font-bold text-accent mb-1">500+</p>
                    <p className="text-xs md:text-sm text-muted-foreground">Cities Covered</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>);

};

export default CTASection;