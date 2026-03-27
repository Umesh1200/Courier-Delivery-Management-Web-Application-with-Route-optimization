import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import HeroSection from './components/HeroSection';
import ServicesSection from './components/ServicesSection';
import FeaturesSection from './components/FeaturesSection';
import TestimonialsSection from './components/TestimonialsSection';
import CTASection from './components/CTASection';
import Footer from './components/Footer';
import Button from '../../components/ui/Button';
import Icon from '../../components/AppIcon';

const safeReadStorage = (key, fallback = '') => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return fallback;
    }
    const value = window.localStorage.getItem(key);
    return value ?? fallback;
  } catch (error) {
    return fallback;
  }
};

const LandingPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [trackingCodeInput, setTrackingCodeInput] = useState('');
  const [trackingCodeError, setTrackingCodeError] = useState('');
  const trackingCodeFromQuery = String(
    searchParams?.get('id') || searchParams?.get('trackingId') || ''
  ).trim();
  const userIdValue = Number(safeReadStorage('userId'));
  const userRole = String(safeReadStorage('userRole', 'customer') || 'customer').trim().toLowerCase();
  const isSignedIn = Number.isFinite(userIdValue) && userIdValue > 0;
  const dashboardPath = userRole === 'admin'
    ? '/admin-dashboard'
    : userRole === 'courier'
      ? '/courier-dashboard'
      : '/user-dashboard';

  useEffect(() => {
    if (trackingCodeFromQuery) {
      setTrackingCodeInput(trackingCodeFromQuery);
    }
  }, [trackingCodeFromQuery]);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 400);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleScrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBookNow = () => {
    navigate('/create-booking');
  };

  const handleSignUp = () => {
    navigate('/signup');
  };

  const handleGetStarted = () => {
    navigate('/signup');
  };

  const handleTrackWithCode = () => {
    const trackingCode = String(trackingCodeInput || '').trim();

    if (!trackingCode) {
      setTrackingCodeError('Tracking code is required.');
      const formNode = typeof document !== 'undefined'
        ? document.getElementById('landing-track-form')
        : null;
      formNode?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setTrackingCodeError('');
    const params = new URLSearchParams({ id: trackingCode });
    navigate(`/order-tracking?${params.toString()}`, {
      state: { trackingNumber: trackingCode }
    });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation Header */}
      <header className="sticky top-0 z-50 bg-card/95 backdrop-blur-sm border-b border-border shadow-elevation-sm">
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 md:h-20">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                <Icon name="Package" size={24} color="var(--color-primary)" />
              </div>
              <span className="text-xl font-semibold text-foreground hidden sm:block">CourierFlow</span>
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center gap-8">
              <a href="#services" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
                Services
              </a>
              <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
                Features
              </a>
              <a href="#testimonials" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
                Testimonials
              </a>
              <a href="#contact" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
                Contact
              </a>
            </nav>

            {/* Action Buttons */}
            <div className="flex items-center gap-3">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={handleTrackWithCode}
                className="hidden sm:flex"
              >
                Track Order
              </Button>
              {isSignedIn ? (
                <Button
                  variant="default"
                  size="sm"
                  iconName="LayoutDashboard"
                  iconPosition="left"
                  onClick={() => navigate(dashboardPath)}
                >
                  Dashboard
                </Button>
              ) : (
                <Button 
                  variant="default" 
                  size="sm"
                  iconName="LogIn"
                  iconPosition="left"
                  onClick={() => navigate('/login')}
                >
                  Sign In
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main>
        <HeroSection
          onBookNow={handleBookNow}
          onSignUp={handleSignUp}
          trackingCodeInput={trackingCodeInput}
          trackingCodeError={trackingCodeError}
          onTrackingCodeChange={(value) => {
            setTrackingCodeInput(value);
            if (trackingCodeError) {
              setTrackingCodeError('');
            }
          }}
          onTrackByCode={handleTrackWithCode}
        />
        
        <div id="services">
          <ServicesSection />
        </div>
        
        <div id="features">
          <FeaturesSection />
        </div>
        
        <div id="testimonials">
          <TestimonialsSection />
        </div>
        
        <CTASection onGetStarted={handleGetStarted} />
      </main>

      {/* Footer */}
      <Footer />

      {/* Scroll to Top Button */}
      {showScrollTop && (
        <button
          onClick={handleScrollToTop}
          className="fixed bottom-6 right-6 z-40 w-12 h-12 bg-primary text-primary-foreground rounded-full shadow-elevation-lg flex items-center justify-center hover:scale-110 transition-transform duration-200"
          aria-label="Scroll to top"
        >
          <Icon name="ArrowUp" size={20} />
        </button>
      )}
    </div>
  );
};

export default LandingPage;
