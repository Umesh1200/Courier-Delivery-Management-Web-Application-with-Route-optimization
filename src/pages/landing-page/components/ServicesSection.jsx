import React from 'react';
import Icon from '../../../components/AppIcon';
import Image from '../../../components/AppImage';
import SameDayDelivery from '../../assets/images/landing-page/delivery-courier-on-motorcycle.jpg';
import StandardDelivery from '../../assets/images/landing-page/rocket_gen_img_12177098f-1767040458682.png';
import ExpressShipping from '../../assets/images/landing-page/white-delivery-truck.jpg';
import BulkShipping from '../../assets/images/landing-page/rocket_gen_img_1a0964812-1767342256090.png';

const ServicesSection = () => {
  const services = [
  {
    id: 1,
    title: "Same-Day Delivery",
    description: "Urgent packages delivered within hours. Perfect for time-sensitive documents and parcels.",
    icon: "Zap",
    image: SameDayDelivery,
    imageAlt: "Delivery courier on red motorcycle speeding through busy city street with package box secured in rear carrier during daytime rush hour",
    price: "From RS 15",
    features: ["2-4 hour delivery", "Real-time tracking", "Priority handling"]
  },
  {
    id: 2,
    title: "Standard Delivery",
    description: "Reliable next-day delivery for regular shipments. Most popular choice for everyday needs.",
    icon: "Package",
    image: StandardDelivery,
    imageAlt: "Stack of brown cardboard shipping boxes with delivery labels on wooden warehouse floor with courier worker in background organizing packages",
    price: "From RS 8",
    features: ["Next-day delivery", "Package insurance", "Email notifications"]
  },
  {
    id: 3,
    title: "Express Shipping",
    description: "Fast nationwide delivery with guaranteed timelines. Ideal for business shipments.",
    icon: "Truck",
    image: ExpressShipping,
    imageAlt: "White delivery truck with company branding parked at modern warehouse loading dock with open cargo door and packages being loaded by workers",
    price: "From RS 25",
    features: ["1-2 day delivery", "Signature required", "Premium support"]
  },
  {
    id: 4,
    title: "Bulk Shipping",
    description: "Cost-effective solutions for businesses with regular shipping needs and high volumes.",
    icon: "Boxes",
    image: BulkShipping,
    imageAlt: "Large warehouse interior filled with organized rows of stacked cardboard boxes on industrial shelving with forklift operator moving pallets in background",
    price: "Custom Quote",
    features: ["Volume discounts", "Dedicated support", "Flexible scheduling"]
  }];


  return (
    <section className="py-12 md:py-16 lg:py-24 bg-background">
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-8 md:mb-12 lg:mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full text-sm md:text-base font-medium text-primary mb-4">
            <Icon name="Sparkles" size={16} />
            <span>Our Services</span>
          </div>
          <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-foreground mb-4">
            Delivery Solutions for Every Need
          </h2>
          <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto">
            Choose from our range of flexible delivery options designed to meet your specific requirements and budget.
          </p>
        </div>

        {/* Services Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
          {services?.map((service) =>
          <div
            key={service?.id}
            className="group bg-card rounded-2xl overflow-hidden shadow-elevation-md hover:shadow-elevation-xl transition-all duration-300 hover:-translate-y-1">

              {/* Service Image */}
              <div className="relative h-48 md:h-56 overflow-hidden">
                <Image
                src={service?.image}
                alt={service?.imageAlt}
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />

                <div className="absolute inset-0 bg-gradient-to-t from-card/90 to-transparent"></div>
                
                {/* Icon Badge */}
                <div className="absolute top-4 left-4 w-12 h-12 bg-primary/90 backdrop-blur-sm rounded-xl flex items-center justify-center">
                  <Icon name={service?.icon} size={24} color="white" />
                </div>

                {/* Price Badge */}
                <div className="absolute bottom-4 right-4 px-3 py-1 bg-card/90 backdrop-blur-sm rounded-lg">
                  <p className="text-sm font-semibold text-primary">{service?.price}</p>
                </div>
              </div>

              {/* Service Content */}
              <div className="p-4 md:p-6">
                <h3 className="text-lg md:text-xl font-semibold text-foreground mb-2">
                  {service?.title}
                </h3>
                <p className="text-sm md:text-base text-muted-foreground mb-4 line-clamp-2">
                  {service?.description}
                </p>

                {/* Features List */}
                <ul className="space-y-2 mb-4">
                  {service?.features?.map((feature, index) =>
                <li key={index} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Icon name="Check" size={16} color="var(--color-success)" />
                      <span>{feature}</span>
                    </li>
                )}
                </ul>

                {/* Learn More Link */}
                <button className="flex items-center gap-2 text-sm font-medium text-primary hover:gap-3 transition-all duration-200">
                  <span>Learn More</span>
                  <Icon name="ArrowRight" size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>);

};

export default ServicesSection;
