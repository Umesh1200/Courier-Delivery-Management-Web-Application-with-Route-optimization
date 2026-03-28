import React from 'react';
import Button from '../../../components/ui/Button';
import Image from '../../../components/AppImage';
import Icon from '../../../components/AppIcon';
import HeroImage from '../../assets/images/landing-page/rocket_gen_img_17700d7e9-1766420092572.png';

const HeroSection = ({
  onBookNow,
  onSignUp,
  trackingCodeInput = '',
  trackingCodeError = '',
  onTrackingCodeChange = () => {},
  onTrackByCode = () => {}
}) => {
  const handleSubmit = (event) => {
    event.preventDefault();
    onTrackByCode();
  };

  return (
    <section className="relative bg-gradient-to-br from-primary/5 via-background to-accent/5 overflow-hidden">
      <div className="absolute inset-0 bg-grid-pattern opacity-5"></div>
      
      <div className="relative max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-12 md:py-16 lg:py-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          {/* Left Content */}
          <div className="text-center lg:text-left space-y-6 md:space-y-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full text-sm md:text-base font-medium text-primary">
              <Icon name="Zap" size={16} />
              <span>Fast & Reliable Delivery</span>
            </div>

            <h1 className="text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold text-foreground leading-tight">
              Your Trusted <span className="text-primary">Courier Partner</span> for Every Delivery
            </h1>

            <p className="text-base md:text-lg lg:text-xl text-muted-foreground max-w-2xl mx-auto lg:mx-0">
              Experience seamless package delivery with real-time tracking, flexible scheduling, and professional couriers. From documents to large parcels, we deliver with care and speed.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
              <Button
                variant="default"
                size="lg"
                iconName="Package"
                iconPosition="left"
                onClick={onBookNow}
                className="w-full sm:w-auto">

                Book Now
              </Button>
              <Button
                variant="outline"
                size="lg"
                iconName="UserPlus"
                iconPosition="left"
                onClick={onSignUp}
                className="w-full sm:w-auto">

                Sign Up Free
              </Button>
            </div>

            <form
              onSubmit={handleSubmit}
              id="landing-track-form"
              className="mx-auto lg:mx-0 w-full max-w-xl rounded-2xl border border-border bg-card/85 p-4 shadow-elevation-sm"
            >
              <p className="text-sm font-semibold text-foreground">Track Your Booking</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Enter tracking code to view status. Live map and chat can be unlocked on the tracking page with delivery access code.
              </p>
              <div className="mt-3 flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={trackingCodeInput}
                  onChange={(event) => onTrackingCodeChange(event?.target?.value || '')}
                  placeholder="Enter tracking code (e.g. CF...)"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
                <Button
                  type="submit"
                  variant="default"
                  iconName="Search"
                  iconPosition="left"
                  className="sm:min-w-[150px]"
                >
                  Track Order
                </Button>
              </div>
              {trackingCodeError ? (
                <p className="mt-2 text-xs text-error">{trackingCodeError}</p>
              ) : null}
            </form>

            {/* Trust Indicators */}
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-6 md:gap-8 pt-4 md:pt-6">
              <div className="flex items-center gap-2">
                <Icon name="Shield" size={20} color="var(--color-success)" />
                <span className="text-sm md:text-base text-muted-foreground">SSL Secured</span>
              </div>
              <div className="flex items-center gap-2">
                <Icon name="Clock" size={20} color="var(--color-success)" />
                <span className="text-sm md:text-base text-muted-foreground">24/7 Support</span>
              </div>
              <div className="flex items-center gap-2">
                <Icon name="Star" size={20} color="var(--color-warning)" />
                <span className="text-sm md:text-base text-muted-foreground">4.9/5 Rating</span>
              </div>
            </div>
          </div>

          {/* Right Image */}
          <div className="relative">
            <div className="relative rounded-2xl overflow-hidden shadow-elevation-xl">
              <Image
                src={HeroImage}
                alt="Professional courier delivery person in blue uniform holding cardboard package box standing next to white delivery van in urban city street setting"
                className="w-full h-64 md:h-80 lg:h-96 object-cover" />

              
              {/* Floating Stats Card */}
              <div className="absolute bottom-4 left-4 right-4 bg-card/95 backdrop-blur-sm rounded-xl p-4 shadow-elevation-lg">
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <p className="text-xl md:text-2xl font-bold text-primary">50K+</p>
                    <p className="text-xs md:text-sm text-muted-foreground">Deliveries</p>
                  </div>
                  <div className="text-center border-x border-border">
                    <p className="text-xl md:text-2xl font-bold text-accent">500+</p>
                    <p className="text-xs md:text-sm text-muted-foreground">Couriers</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xl md:text-2xl font-bold text-success">98%</p>
                    <p className="text-xs md:text-sm text-muted-foreground">On-Time</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Decorative Elements */}
            <div className="hidden lg:block absolute -top-6 -right-6 w-24 h-24 bg-primary/10 rounded-full blur-2xl"></div>
            <div className="hidden lg:block absolute -bottom-6 -left-6 w-32 h-32 bg-accent/10 rounded-full blur-2xl"></div>
          </div>
        </div>
      </div>
    </section>);

};
export default HeroSection;
