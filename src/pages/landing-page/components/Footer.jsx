import React from 'react';
import Icon from '../../../components/AppIcon';
import { Link } from 'react-router-dom';

const Footer = () => {
  const currentYear = new Date()?.getFullYear();

  const footerLinks = {
    company: [
      { label: "About Us", href: "#" },
      { label: "Careers", href: "#" },
      { label: "Press", href: "#" },
      { label: "Blog", href: "#" }
    ],
    services: [
      { label: "Same-Day Delivery", href: "#" },
      { label: "Express Shipping", href: "#" },
      { label: "Bulk Shipping", href: "#" },
      { label: "Pricing", href: "#" }
    ],
    support: [
      { label: "Help Center", href: "#" },
      { label: "Contact Us", href: "#" },
      { label: "Track Package", href: "/order-tracking" },
      { label: "FAQs", href: "#" }
    ],
    legal: [
      { label: "Privacy Policy", href: "#" },
      { label: "Terms of Service", href: "#" },
      { label: "Cookie Policy", href: "#" },
      { label: "Refund Policy", href: "#" }
    ]
  };

  const socialLinks = [
    { name: "Facebook", icon: "Facebook", href: "#" },
    { name: "Twitter", icon: "Twitter", href: "#" },
    { name: "Instagram", icon: "Instagram", href: "#" },
    { name: "Linkedin", icon: "Linkedin", href: "#" }
  ];

  return (
    <footer className="bg-card border-t border-border">
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8 md:py-12 lg:py-16">
        {/* Main Footer Content */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-8 md:gap-12 mb-8 md:mb-12">
          {/* Brand Section */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                <Icon name="Package" size={24} color="var(--color-primary)" />
              </div>
              <span className="text-xl font-semibold text-foreground">CourierFlow</span>
            </div>
            <p className="text-sm md:text-base text-muted-foreground mb-6 leading-relaxed">
              Your trusted partner for fast, reliable, and secure courier services. Delivering excellence with every package.
            </p>
            
            {/* Social Links */}
            <div className="flex items-center gap-3">
              {socialLinks?.map((social) => (
                <a
                  key={social?.name}
                  href={social?.href}
                  className="w-10 h-10 bg-muted hover:bg-primary/10 rounded-lg flex items-center justify-center transition-colors duration-200"
                  aria-label={social?.name}
                >
                  <Icon name={social?.icon} size={18} />
                </a>
              ))}
            </div>
          </div>

          {/* Company Links */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-4">Company</h3>
            <ul className="space-y-3">
              {footerLinks?.company?.map((link) => (
                <li key={link?.label}>
                  <a 
                    href={link?.href}
                    className="text-sm text-muted-foreground hover:text-primary transition-colors duration-200"
                  >
                    {link?.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Services Links */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-4">Services</h3>
            <ul className="space-y-3">
              {footerLinks?.services?.map((link) => (
                <li key={link?.label}>
                  <a 
                    href={link?.href}
                    className="text-sm text-muted-foreground hover:text-primary transition-colors duration-200"
                  >
                    {link?.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Support Links */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-4">Support</h3>
            <ul className="space-y-3">
              {footerLinks?.support?.map((link) => (
                <li key={link?.label}>
                  {link?.href?.startsWith('/') ? (
                    <Link 
                      to={link?.href}
                      className="text-sm text-muted-foreground hover:text-primary transition-colors duration-200"
                    >
                      {link?.label}
                    </Link>
                  ) : (
                    <a 
                      href={link?.href}
                      className="text-sm text-muted-foreground hover:text-primary transition-colors duration-200"
                    >
                      {link?.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Legal Links */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-4">Legal</h3>
            <ul className="space-y-3">
              {footerLinks?.legal?.map((link) => (
                <li key={link?.label}>
                  <a 
                    href={link?.href}
                    className="text-sm text-muted-foreground hover:text-primary transition-colors duration-200"
                  >
                    {link?.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Contact Info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 py-8 border-y border-border">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
              <Icon name="Mail" size={20} color="var(--color-primary)" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground mb-1">Email Us</p>
              <a href="mailto:support@courierflow.com" className="text-sm text-muted-foreground hover:text-primary">
                support@courierflow.com
              </a>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
              <Icon name="Phone" size={20} color="var(--color-primary)" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground mb-1">Call Us</p>
              <a href="tel:+1-800-COURIER" className="text-sm text-muted-foreground hover:text-primary">
                +1 (800) COURIER
              </a>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
              <Icon name="MapPin" size={20} color="var(--color-primary)" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground mb-1">Visit Us</p>
              <p className="text-sm text-muted-foreground">
                123 Delivery Street, Suite 100<br />New York, NY 10001
              </p>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-8">
          <p className="text-sm text-muted-foreground text-center md:text-left">
            &copy; {currentYear} CourierFlow. All rights reserved.
          </p>
          
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Icon name="Shield" size={16} color="var(--color-success)" />
              <span className="text-xs text-muted-foreground">SSL Secured</span>
            </div>
            <div className="flex items-center gap-2">
              <Icon name="Award" size={16} color="var(--color-success)" />
              <span className="text-xs text-muted-foreground">Certified Service</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;