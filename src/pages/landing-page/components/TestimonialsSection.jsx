import React from 'react';
import Icon from '../../../components/AppIcon';
import Image from '../../../components/AppImage';

const TestimonialsSection = () => {
  const testimonials = [
  {
    id: 1,
    name: "Sarah Johnson",
    role: "Small Business Owner",
    avatar: "https://img.rocket.new/generatedImages/rocket_gen_img_170699746-1763294878713.png",
    avatarAlt: "Professional headshot of Caucasian woman with shoulder-length brown hair wearing navy blue blazer smiling warmly at camera",
    rating: 5,
    comment: "CourierFlow has transformed how we handle deliveries. The real-time tracking and reliable service have made our customers much happier. Highly recommended for any business!",
    date: "December 28, 2025"
  },
  {
    id: 2,
    name: "Michael Chen",
    role: "E-commerce Manager",
    avatar: "https://img.rocket.new/generatedImages/rocket_gen_img_1665ca73c-1763296377705.png",
    avatarAlt: "Professional headshot of Asian man with short black hair wearing gray suit and white shirt with confident expression",
    rating: 5,
    comment: "The bulk shipping options and volume discounts have saved us thousands. The platform is intuitive and the courier network is extensive. Best decision we made this year.",
    date: "December 25, 2025"
  },
  {
    id: 3,
    name: "Emily Rodriguez",
    role: "Freelance Designer",
    avatar: "https://img.rocket.new/generatedImages/rocket_gen_img_1dfbfb501-1763296570605.png",
    avatarAlt: "Professional headshot of Hispanic woman with long dark hair wearing red blouse with friendly smile in natural lighting",
    rating: 5,
    comment: "As a freelancer, I need reliable delivery for client samples. CourierFlow's same-day service is a lifesaver. The app is easy to use and customer support is excellent.",
    date: "December 22, 2025"
  },
  {
    id: 4,
    name: "David Thompson",
    role: "Operations Director",
    avatar: "https://img.rocket.new/generatedImages/rocket_gen_img_1faa738ad-1763294932464.png",
    avatarAlt: "Professional headshot of African American man with short hair wearing dark suit and tie with professional demeanor",
    rating: 5,
    comment: "We've tried multiple courier services, but CourierFlow stands out. The scheduling flexibility and transparent pricing make logistics planning so much easier.",
    date: "December 20, 2025"
  },
  {
    id: 5,
    name: "Lisa Anderson",
    role: "Retail Store Manager",
    avatar: "https://img.rocket.new/generatedImages/rocket_gen_img_1b5600450-1763294005133.png",
    avatarAlt: "Professional headshot of Caucasian woman with blonde hair in ponytail wearing white shirt with warm smile",
    rating: 5,
    comment: "The verified couriers and secure delivery options give us peace of mind. Our inventory transfers between stores have never been smoother. Fantastic service!",
    date: "December 18, 2025"
  },
  {
    id: 6,
    name: "James Wilson",
    role: "Startup Founder",
    avatar: "https://img.rocket.new/generatedImages/rocket_gen_img_17ea041e2-1763295992510.png",
    avatarAlt: "Professional headshot of Caucasian man with beard wearing casual blue shirt with confident smile in office setting",
    rating: 5,
    comment: "CourierFlow scaled with our startup perfectly. From a few packages a week to hundreds daily, the platform handled it all seamlessly. The analytics are incredibly helpful.",
    date: "December 15, 2025"
  }];


  return (
    <section className="py-12 md:py-16 lg:py-24 bg-background">
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-8 md:mb-12 lg:mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-success/10 rounded-full text-sm md:text-base font-medium text-success mb-4">
            <Icon name="MessageSquare" size={16} />
            <span>Customer Reviews</span>
          </div>
          <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-foreground mb-4">
            Trusted by Thousands of Happy Customers
          </h2>
          <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto">
            Don't just take our word for it. See what our customers have to say about their experience with CourierFlow.
          </p>
        </div>

        {/* Testimonials Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
          {testimonials?.map((testimonial) =>
          <div
            key={testimonial?.id}
            className="bg-card rounded-2xl p-6 md:p-8 shadow-elevation-md hover:shadow-elevation-lg transition-all duration-300">

              {/* Rating Stars */}
              <div className="flex items-center gap-1 mb-4">
                {[...Array(testimonial?.rating)]?.map((_, index) =>
              <Icon key={index} name="Star" size={16} color="var(--color-warning)" className="fill-current" />
              )}
              </div>

              {/* Comment */}
              <p className="text-sm md:text-base text-muted-foreground mb-6 leading-relaxed line-clamp-4">
                "{testimonial?.comment}"
              </p>

              {/* Author Info */}
              <div className="flex items-center gap-3 pt-4 border-t border-border">
                <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0">
                  <Image
                  src={testimonial?.avatar}
                  alt={testimonial?.avatarAlt}
                  className="w-full h-full object-cover" />

                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm md:text-base font-semibold text-foreground">
                    {testimonial?.name}
                  </p>
                  <p className="text-xs md:text-sm text-muted-foreground">
                    {testimonial?.role}
                  </p>
                </div>
              </div>

              {/* Date */}
              <p className="text-xs text-muted-foreground mt-3">
                {testimonial?.date}
              </p>
            </div>
          )}
        </div>

        {/* Trust Badges */}
        <div className="mt-12 md:mt-16 flex flex-wrap items-center justify-center gap-6 md:gap-12">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-success/10 rounded-xl flex items-center justify-center">
              <Icon name="Award" size={24} color="var(--color-success)" />
            </div>
            <div>
              <p className="text-lg md:text-xl font-bold text-foreground">4.9/5</p>
              <p className="text-xs md:text-sm text-muted-foreground">Average Rating</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
              <Icon name="Users" size={24} color="var(--color-primary)" />
            </div>
            <div>
              <p className="text-lg md:text-xl font-bold text-foreground">10K+</p>
              <p className="text-xs md:text-sm text-muted-foreground">Happy Customers</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-accent/10 rounded-xl flex items-center justify-center">
              <Icon name="TrendingUp" size={24} color="var(--color-accent)" />
            </div>
            <div>
              <p className="text-lg md:text-xl font-bold text-foreground">98%</p>
              <p className="text-xs md:text-sm text-muted-foreground">Success Rate</p>
            </div>
          </div>
        </div>
      </div>
    </section>);

};

export default TestimonialsSection;