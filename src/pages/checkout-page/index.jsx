import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import RoleBasedNavigation from '../../components/ui/RoleBasedNavigation';
import Button from '../../components/ui/Button';
import Icon from '../../components/AppIcon';
import OrderSummary from './components/OrderSummary';
import PaymentMethodSelector from './components/PaymentMethodSelector';
import BillingAddressForm from './components/BillingAddressForm';
import PromoCodeInput from './components/PromoCodeInput';
import TermsAgreement from './components/TermsAgreement';

const CheckoutPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isProcessing, setIsProcessing] = useState(false);
  const [errors, setErrors] = useState({});
  const userName = localStorage.getItem('userName') || 'User';

  // Mock booking data (in real app, this would come from location.state or API)
  const [bookingData] = useState({
    packageDetails: {
      category: 'Electronics',
      size: 'Medium',
      weight: '5 kg',
      description: 'Laptop computer'
    },
    pickupAddress: {
      street: '123 Main St',
      city: 'San Francisco',
      province: 'CA',
      postalCode: '94102',
      contactName: 'John Doe',
      phone: '+977-9812345678'
    },
    deliveryAddress: {
      street: '456 Oak Ave',
      city: 'Los Angeles',
      province: 'CA',
      postalCode: '90001',
      contactName: 'Jane Smith',
      phone: '+977-9811122233'
    },
    serviceType: 'same-day',
    scheduledDate: '2026-01-05',
    scheduledTime: '2:00 PM - 4:00 PM'
  });

  const [pricing, setPricing] = useState({
    baseRate: 15.00,
    distanceFee: 25.00,
    serviceFee: 25.00,
    additionalFees: 5.00,
    subtotal: 70.00,
    tax: 5.60,
    discount: 0,
    total: 75.60
  });

  const [paymentData, setPaymentData] = useState({
    paymentMethod: '',
    cardNumber: '',
    cardName: '',
    expiryDate: '',
    cvv: '',
    saveCard: false
  });

  const [billingAddress, setBillingAddress] = useState({
    sameAsPickup: true,
    street: '',
    city: '',
    province: '',
    postalCode: ''
  });

  const [promoCode, setPromoCode] = useState('');
  const [promoApplied, setPromoApplied] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);

  useEffect(() => {
    if (billingAddress?.sameAsPickup) {
      setBillingAddress(prev => ({
        ...prev,
        street: bookingData?.pickupAddress?.street,
        city: bookingData?.pickupAddress?.city,
        province: bookingData?.pickupAddress?.province,
        postalCode: bookingData?.pickupAddress?.postalCode
      }));
    }
  }, [billingAddress?.sameAsPickup, bookingData]);

  const handlePaymentChange = (field, value) => {
    setPaymentData(prev => ({
      ...prev,
      [field]: value
    }));
    if (errors?.[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: ''
      }));
    }
  };

  const handleBillingChange = (field, value) => {
    setBillingAddress(prev => ({
      ...prev,
      [field]: value
    }));
    if (errors?.[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: ''
      }));
    }
  };

  const handleApplyPromo = () => {
    if (promoCode?.toUpperCase() === 'SAVE10') {
      const discount = pricing?.subtotal * 0.1;
      const newTotal = pricing?.subtotal + pricing?.tax - discount;
      setPricing(prev => ({
        ...prev,
        discount,
        total: newTotal
      }));
      setPromoApplied(true);
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!paymentData?.paymentMethod) {
      newErrors.paymentMethod = 'Please select a payment method';
    }

    if (paymentData?.paymentMethod === 'credit-card' || paymentData?.paymentMethod === 'debit-card') {
      if (!paymentData?.cardNumber) newErrors.cardNumber = 'Card number is required';
      if (!paymentData?.cardName) newErrors.cardName = 'Cardholder name is required';
      if (!paymentData?.expiryDate) newErrors.expiryDate = 'Expiry date is required';
      if (!paymentData?.cvv) newErrors.cvv = 'CVV is required';
    }

    if (!billingAddress?.sameAsPickup) {
      if (!billingAddress?.street) newErrors.billingStreet = 'Street address is required';
      if (!billingAddress?.city) newErrors.billingCity = 'City is required';
      if (!billingAddress?.province) newErrors.billingProvince = 'Province is required';
      if (!billingAddress?.postalCode) newErrors.billingPostalCode = 'Postal code is required';
    }

    if (!termsAccepted) {
      newErrors.terms = 'You must accept the terms of service';
    }

    if (!privacyAccepted) {
      newErrors.privacy = 'You must accept the privacy policy';
    }

    setErrors(newErrors);
    return Object.keys(newErrors)?.length === 0;
  };

  const handleCompleteBooking = () => {
    if (validateForm()) {
      setIsProcessing(true);
      setTimeout(() => {
        navigate('/user-dashboard', {
          state: {
            message: 'Booking completed successfully! Tracking ID: CF2026001',
            paymentConfirmed: true
          }
        });
      }, 2000);
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <RoleBasedNavigation userRole="customer" userName={userName} />
      <div className="pt-[60px]">
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-6 md:py-8 lg:py-12">
          <div className="mb-6 md:mb-8">
            <button
              onClick={() => navigate('/create-booking')}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
            >
              <Icon name="ArrowLeft" size={16} />
              Back to Booking
            </button>
            <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-foreground mb-2">Checkout</h1>
            <p className="text-sm md:text-base text-muted-foreground">Review your order and complete payment</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
            {/* Left Column - Order Summary */}
            <div className="lg:col-span-1 space-y-6">
              <OrderSummary 
                bookingData={bookingData} 
                pricing={pricing}
              />
            </div>

            {/* Right Column - Payment & Billing */}
            <div className="lg:col-span-2 space-y-6">
              {/* Payment Method Selection */}
              <PaymentMethodSelector
                paymentData={paymentData}
                onChange={handlePaymentChange}
                errors={errors}
              />

              {/* Billing Address */}
              <BillingAddressForm
                billingAddress={billingAddress}
                onChange={handleBillingChange}
                errors={errors}
              />

              {/* Promo Code */}
              <PromoCodeInput
                promoCode={promoCode}
                setPromoCode={setPromoCode}
                onApply={handleApplyPromo}
                promoApplied={promoApplied}
              />

              {/* Terms & Conditions */}
              <TermsAgreement
                termsAccepted={termsAccepted}
                setTermsAccepted={setTermsAccepted}
                privacyAccepted={privacyAccepted}
                setPrivacyAccepted={setPrivacyAccepted}
                errors={errors}
              />

              {/* Security Badge */}
              <div className="bg-card rounded-xl p-4 md:p-6 shadow-elevation-sm border border-border">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-success/10 rounded-lg flex items-center justify-center">
                    <Icon name="Shield" size={20} color="var(--color-success)" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Secure Payment</p>
                    <p className="text-xs text-muted-foreground">Your payment information is encrypted and secure</p>
                  </div>
                </div>
              </div>

              {/* Complete Booking Button */}
              <div className="bg-card rounded-xl p-4 md:p-6 shadow-elevation-md">
                <Button
                  variant="default"
                  size="lg"
                  fullWidth
                  onClick={handleCompleteBooking}
                  loading={isProcessing}
                  disabled={isProcessing}
                  iconName="CheckCircle"
                  iconPosition="left"
                >
                  {isProcessing ? 'Processing Payment...' : 'Complete Booking'}
                </Button>
                <p className="text-xs text-center text-muted-foreground mt-3">
                  By completing this booking, you agree to our terms of service and privacy policy
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CheckoutPage;
