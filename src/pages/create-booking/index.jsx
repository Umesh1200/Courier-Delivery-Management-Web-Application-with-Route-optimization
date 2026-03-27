import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import RoleBasedNavigation from '../../components/ui/RoleBasedNavigation';

import QuickActionPanel from '../../components/ui/QuickActionPanel';
import Button from '../../components/ui/Button';
import Icon from '../../components/AppIcon';
import PackageDetailsForm from './components/PackageDetailsForm';
import AddressForm from './components/AddressForm';
import SchedulingForm from './components/SchedulingForm';
import SpecialInstructionsForm from './components/SpecialInstructionsForm';
import PricingCalculator from './components/PricingCalculator';
import ProgressIndicator from './components/ProgressIndicator';
import SummaryPaymentStep from './components/SummaryPaymentStep';
import postalCsv from './nepal_postal_codes.csv?raw';

const processedKhaltiCallbackKeys = new Set();

const CreateBooking = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [currentStep, setCurrentStep] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [showSaveConfirmation, setShowSaveConfirmation] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [successData, setSuccessData] = useState(null);
  const [copyCodeFeedback, setCopyCodeFeedback] = useState('');
  const userName = localStorage.getItem('userName') || 'User';
  const userId = localStorage.getItem('userId');
  const repeatAppliedRef = useRef(false);
  const copyCodeResetTimeoutRef = useRef(null);

  const steps = [
    { id: 'package', label: 'Package Details', icon: 'Package' },
    { id: 'address', label: 'Addresses', icon: 'MapPin' },
    { id: 'schedule', label: 'Schedule', icon: 'Calendar' },
    { id: 'instructions', label: 'Instructions', icon: 'FileText' },
    { id: 'summary', label: 'Summary & Payment', icon: 'CreditCard' }
  ];

  const [formData, setFormData] = useState({
    category: '',
    size: '',
    weight: '',
    description: '',
    length: '',
    width: '',
    height: '',
    pickupAddress: '',
    pickupCity: '',
    pickupProvince: '',
    pickupPostalCode: '',
    pickupPhone: '',
    pickupContactName: '',
    pickupLat: '',
    pickupLng: '',
    deliveryAddress: '',
    deliveryCity: '',
    deliveryProvince: '',
    deliveryPostalCode: '',
    deliveryPhone: '',
    deliveryContactName: '',
    deliveryLat: '',
    deliveryLng: '',
    serviceType: '',
    scheduledDate: '',
    scheduledTime: '',
    specialInstructions: '',
    signatureRequired: false,
    photoProof: false,
    callBeforeDelivery: false,
    fragileHandling: false,
    insurance: false
  });

  const [errors, setErrors] = useState({});
  const [paymentMethod, setPaymentMethod] = useState('');
  const [pendingPayment, setPendingPayment] = useState(null);

  const postalIndex = useMemo(() => {
    const codes = new Set();
    const byDistrict = new Map();
    const lines = postalCsv.split(/\r?\n/);
    for (const line of lines) {
      if (!line) continue;
      const parts = line.split(',');
      const district = (parts[0] || '').trim();
      const code = (parts[2] || '').trim();
      if (!code || !/^\d+$/.test(code)) {
        continue;
      }
      codes.add(code);
      if (district) {
        const key = district.toLowerCase();
        if (!byDistrict.has(key)) {
          byDistrict.set(key, []);
        }
        byDistrict.get(key).push(code);
      }
    }
    return { codes, byDistrict };
  }, []);

  const normalizePostal = (value) => String(value || '').replace(/\D/g, '');
  const parseAddressString = (value) => {
    if (!value) return {};
    const parts = String(value).split(',').map((item) => item.trim()).filter(Boolean);
    if (parts.length < 3) {
      return { line1: value };
    }
    const line1 = parts[0];
    const city = parts[1];
    const provincePostal = parts.slice(2).join(', ');
    const match = provincePostal.match(/^(.*)\s+(\S+)$/);
    if (match) {
      return {
        line1,
        city,
        province: match[1].trim(),
        postalCode: match[2].trim()
      };
    }
    return {
      line1,
      city,
      province: provincePostal.trim()
    };
  };

  const calculatePricing = (data) => {
    let baseRate = 500.00;
    let distanceFee = 0;
    let weightFee = 0;
    let serviceFee = 0;
    let additionalFees = 0;

    const pickupLat = Number(data?.pickupLat);
    const pickupLng = Number(data?.pickupLng);
    const deliveryLat = Number(data?.deliveryLat);
    const deliveryLng = Number(data?.deliveryLng);
    if ([pickupLat, pickupLng, deliveryLat, deliveryLng].every(Number.isFinite)) {
      const toRad = (value) => (value * Math.PI) / 180;
      const earthRadius = 6371;
      const dLat = toRad(deliveryLat - pickupLat);
      const dLng = toRad(deliveryLng - pickupLng);
      const a = Math.sin(dLat / 2) ** 2
        + Math.cos(toRad(pickupLat)) * Math.cos(toRad(deliveryLat)) * Math.sin(dLng / 2) ** 2;
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance = earthRadius * c;
      distanceFee = Math.min(distance * 2.5, 50);
    } else if (data?.pickupPostalCode && data?.deliveryPostalCode) {
      const distance = Math.abs(parseInt(data?.pickupPostalCode) - parseInt(data?.deliveryPostalCode)) / 100;
      distanceFee = Math.min(distance * 2.5, 50);
    }

    if (data?.weight) {
      const weight = parseFloat(data?.weight);
      if (weight > 20) {
        weightFee = (weight - 20) * 1.5;
      }
    }

    switch (data?.serviceType) {
      case 'same-day':
        serviceFee = 25.00;
        break;
      case 'express':
        serviceFee = 40.00;
        break;
      case 'next-day':
        serviceFee = 10.00;
        break;
      case 'scheduled':
        serviceFee = 5.00;
        break;
      default:
        serviceFee = 0;
    }

    if (data?.signatureRequired) additionalFees += 3.00;
    if (data?.photoProof) additionalFees += 2.00;
    if (data?.callBeforeDelivery) additionalFees += 1.50;
    if (data?.fragileHandling) additionalFees += 5.00;
    const subtotal = baseRate + distanceFee + weightFee + serviceFee + additionalFees;
    const tax = subtotal * 0.08;
    const total = subtotal + tax;

    return {
      baseRate,
      distanceFee,
      weightFee,
      serviceFee,
      additionalFees,
      subtotal,
      tax,
      total
    };
  };

  const pricing = useMemo(() => calculatePricing(formData), [formData]);

  useEffect(() => {
    const savedDraft = localStorage.getItem('bookingDraft');
    if (savedDraft) {
      try {
        const parsedDraft = JSON.parse(savedDraft);
        setFormData(parsedDraft);
      } catch (error) {
        console.error('Error loading draft:', error);
      }
    }
  }, []);

  useEffect(() => {
    const repeatBooking = location?.state?.repeatBooking;
    if (!repeatBooking || repeatAppliedRef.current) {
      return;
    }
    repeatAppliedRef.current = true;

    const pickupParsed = parseAddressString(repeatBooking?.pickup);
    const deliveryParsed = parseAddressString(repeatBooking?.delivery);

    setFormData((prev) => ({
      ...prev,
      category: repeatBooking?.packageType || prev.category,
      pickupAddress: pickupParsed.line1 || prev.pickupAddress,
      pickupCity: pickupParsed.city || prev.pickupCity,
      pickupProvince: pickupParsed.province || prev.pickupProvince,
      pickupPostalCode: pickupParsed.postalCode || prev.pickupPostalCode,
      deliveryAddress: deliveryParsed.line1 || prev.deliveryAddress,
      deliveryCity: deliveryParsed.city || prev.deliveryCity,
      deliveryProvince: deliveryParsed.province || prev.deliveryProvince,
      deliveryPostalCode: deliveryParsed.postalCode || prev.deliveryPostalCode
    }));
    setCurrentStep(0);
  }, [location?.state]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const pidx = params.get('pidx');
    if (!pidx) {
      return;
    }
    const callbackKey = `khalti:${pidx}`;
    if (processedKhaltiCallbackKeys.has(callbackKey)) {
      return;
    }
    processedKhaltiCallbackKeys.add(callbackKey);

    const verifyPayment = async () => {
      setIsVerifying(true);
      setSubmitError('');
      try {
        const res = await fetch('http://localhost:8000/api/payments/khalti/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pidx })
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(payload?.error || 'Unable to verify Khalti payment.');
        }

        if (payload?.status === 'paid') {
          const storedForm = localStorage.getItem('pendingKhaltiForm');
          const storedPricing = localStorage.getItem('pendingKhaltiPricing');
          if (!storedForm || !storedPricing) {
            throw new Error('Payment is successful, but booking details are missing. No booking was created. Please create the booking again.');
          }
          const form = JSON.parse(storedForm);
          const pricingSnapshot = JSON.parse(storedPricing);
          const bookingPayload = await createBooking(form, {
            ...pricingSnapshot,
            method: 'khalti',
            status: 'paid',
            providerReference: pidx,
            providerPayload: payload?.details || null,
            initiate: false
          });
          localStorage.removeItem('bookingDraft');
          localStorage.removeItem('pendingKhaltiForm');
          localStorage.removeItem('pendingKhaltiPricing');
          localStorage.removeItem('pendingKhaltiPidx');
          setSuccessData({
            bookingCode: bookingPayload?.booking?.bookingCode || '',
            deliveryAccessCode: bookingPayload?.booking?.deliveryAccessCode || ''
          });
        } else if (payload?.status === 'failed') {
          throw new Error('Khalti payment failed. Booking was not created. Please try again.');
        } else {
          setSubmitError('Khalti payment is pending. Booking was not created yet.');
        }
      } catch (error) {
        processedKhaltiCallbackKeys.delete(callbackKey);
        setSubmitError(error?.message || 'Unable to verify payment right now.');
      } finally {
        setIsVerifying(false);
      }
    };

    verifyPayment();
  }, [location.search]);

  useEffect(() => () => {
    if (copyCodeResetTimeoutRef.current) {
      window.clearTimeout(copyCodeResetTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    if (successData?.bookingCode) {
      setCopyCodeFeedback('');
    }
  }, [successData?.bookingCode]);

  const handleChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    if (submitError) {
      setSubmitError('');
    }
    if (errors?.[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: ''
      }));
    }
  };

  const handlePaymentChange = (value) => {
    setPaymentMethod(value);
    if (errors?.paymentMethod) {
      setErrors(prev => ({
        ...prev,
        paymentMethod: ''
      }));
    }
  };

  const validateStep = (step) => {
    const newErrors = {};

    switch (step) {
      case 0:
        if (!formData?.category) newErrors.category = 'Please select a package category';
        if (!formData?.size) newErrors.size = 'Please select a package size';
        if (!formData?.weight) newErrors.weight = 'Please enter package weight';
        if (!formData?.description) newErrors.description = 'Please provide a package description';
        break;
      case 1:
        if (!formData?.pickupAddress) newErrors.pickupAddress = 'Pickup address is required';
        if (!formData?.pickupCity) newErrors.pickupCity = 'Pickup city is required';
        if (!formData?.pickupProvince) newErrors.pickupProvince = 'Pickup province is required';
        if (!formData?.pickupPostalCode) newErrors.pickupPostalCode = 'Pickup postal code is required';
        if (!formData?.pickupPhone) newErrors.pickupPhone = 'Pickup phone is required';
        if (!formData?.pickupContactName) newErrors.pickupContactName = 'Pickup contact name is required';
        if (!formData?.deliveryAddress) newErrors.deliveryAddress = 'Delivery address is required';
        if (!formData?.deliveryCity) newErrors.deliveryCity = 'Delivery city is required';
        if (!formData?.deliveryProvince) newErrors.deliveryProvince = 'Delivery province is required';
        if (!formData?.deliveryPostalCode) newErrors.deliveryPostalCode = 'Delivery postal code is required';
        if (!formData?.deliveryPhone) newErrors.deliveryPhone = 'Delivery phone is required';
        if (!formData?.deliveryContactName) newErrors.deliveryContactName = 'Delivery contact name is required';
        {
          const pickupPostal = normalizePostal(formData?.pickupPostalCode);
          if (pickupPostal && !postalIndex.codes.has(pickupPostal)) {
            newErrors.pickupPostalCode = 'Pickup postal code must be a valid Nepal postal code';
          }
        }
        {
          const deliveryPostal = normalizePostal(formData?.deliveryPostalCode);
          if (deliveryPostal && !postalIndex.codes.has(deliveryPostal)) {
            newErrors.deliveryPostalCode = 'Delivery postal code must be a valid Nepal postal code';
          }
        }
        break;
      case 2:
        if (!formData?.serviceType) newErrors.serviceType = 'Please select a service type';
        if (formData?.serviceType === 'scheduled') {
          if (!formData?.scheduledDate) newErrors.scheduledDate = 'Please select a delivery date';
          if (!formData?.scheduledTime) newErrors.scheduledTime = 'Please select a time slot';
        }
        break;
      case 3:
        break;
      case 4:
        if (!paymentMethod) newErrors.paymentMethod = 'Please select a payment method';
        break;
      default:
        break;
    }

    setErrors(newErrors);
    return Object.keys(newErrors)?.length === 0;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      if (currentStep < steps?.length - 1) {
        setCurrentStep(prev => prev + 1);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleSaveDraft = () => {
    setIsSaving(true);
    localStorage.setItem('bookingDraft', JSON.stringify(formData));
    setTimeout(() => {
      setIsSaving(false);
      setShowSaveConfirmation(true);
      setTimeout(() => setShowSaveConfirmation(false), 3000);
    }, 1000);
  };

  const buildBookingPayload = (data, payment) => ({
    customerId: Number(userId),
    pickup: {
      address: data?.pickupAddress,
      city: data?.pickupCity,
      province: data?.pickupProvince,
      postalCode: data?.pickupPostalCode,
      phone: data?.pickupPhone,
      contactName: data?.pickupContactName,
      lat: data?.pickupLat,
      lng: data?.pickupLng
    },
    delivery: {
      address: data?.deliveryAddress,
      city: data?.deliveryCity,
      province: data?.deliveryProvince,
      postalCode: data?.deliveryPostalCode,
      phone: data?.deliveryPhone,
      contactName: data?.deliveryContactName,
      lat: data?.deliveryLat,
      lng: data?.deliveryLng
    },
    package: {
      category: data?.category,
      size: data?.size,
      weight: data?.weight,
      description: data?.description,
      length: data?.length,
      width: data?.width,
      height: data?.height
    },
    schedule: {
      serviceType: data?.serviceType,
      scheduledDate: data?.scheduledDate,
      scheduledTime: data?.scheduledTime
    },
    options: {
      specialInstructions: data?.specialInstructions,
      signatureRequired: data?.signatureRequired,
      photoProof: data?.photoProof,
      callBeforeDelivery: data?.callBeforeDelivery,
      fragileHandling: data?.fragileHandling,
      insurance: data?.insurance
    },
    payment
  });

  const createBooking = async (data, payment) => {
    const res = await fetch('http://localhost:8000/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildBookingPayload(data, payment))
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      throw new Error(payload?.error || 'Failed to create booking');
    }
    return res.json();
  };

  const handleSubmit = async () => {
    if (!validateStep(currentStep)) {
      return;
    }
    if (!userId) {
      setSubmitError('Please log in again before submitting this booking.');
      return;
    }
    setIsSubmitting(true);
    setSubmitError('');
    try {
      const returnUrl = `${window.location.origin}/create-booking?payment=khalti`;
      const websiteUrl = window.location.origin;
      const paymentPayload = {
        method: paymentMethod,
        total: pricing?.total || 0,
        subtotal: pricing?.subtotal || 0,
        tax: pricing?.tax || 0,
        baseRate: pricing?.baseRate || 0,
        distanceFee: pricing?.distanceFee || 0,
        serviceFee: pricing?.serviceFee || 0,
        additionalFees: pricing?.additionalFees || 0,
        discount: 0
      };

      if (paymentMethod === 'khalti') {
        const initRes = await fetch('http://localhost:8000/api/payments/khalti/initiate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: paymentPayload.total,
            returnUrl,
            websiteUrl,
            purchaseOrderName: 'Courier booking',
            customer: {
              name: userName,
              email: localStorage.getItem('userEmail') || '',
              phone: formData?.pickupPhone || ''
            }
          })
        });
        const initPayload = await initRes.json().catch(() => ({}));
        if (!initRes.ok || !initPayload?.payment?.paymentUrl) {
          const errorMessage = initPayload?.error
            || initPayload?.payment?.error?.message
            || 'Unable to start Khalti payment. Booking was not created.';
          throw new Error(errorMessage);
        }

        localStorage.setItem('pendingKhaltiForm', JSON.stringify(formData));
        localStorage.setItem('pendingKhaltiPricing', JSON.stringify(paymentPayload));
        localStorage.setItem('pendingKhaltiPidx', initPayload?.payment?.providerReference || '');

        window.location.href = initPayload.payment.paymentUrl;
        return;
      }

      const payload = await createBooking(formData, {
        ...paymentPayload,
        status: 'pending'
      });
      localStorage.removeItem('bookingDraft');
      const bookingCode = payload?.booking?.bookingCode || '';
      const deliveryAccessCode = payload?.booking?.deliveryAccessCode || '';
      setSuccessData({ bookingCode, deliveryAccessCode });
    } catch (error) {
      setSubmitError(error?.message || 'Unable to submit booking right now.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyCode = async (rawCode, label) => {
    const code = String(rawCode || '').trim();
    if (!code) {
      setCopyCodeFeedback('Code unavailable');
      return;
    }

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
      } else {
        const hiddenTextarea = document.createElement('textarea');
        hiddenTextarea.value = code;
        hiddenTextarea.setAttribute('readonly', '');
        hiddenTextarea.style.position = 'absolute';
        hiddenTextarea.style.left = '-9999px';
        document.body.appendChild(hiddenTextarea);
        hiddenTextarea.select();
        document.execCommand('copy');
        document.body.removeChild(hiddenTextarea);
      }
      setCopyCodeFeedback(`${label || 'Code'} copied`);
    } catch (error) {
      setCopyCodeFeedback('Copy failed');
    }

    if (copyCodeResetTimeoutRef.current) {
      window.clearTimeout(copyCodeResetTimeoutRef.current);
    }
    copyCodeResetTimeoutRef.current = window.setTimeout(() => {
      setCopyCodeFeedback('');
    }, 2200);
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return <PackageDetailsForm formData={formData} errors={errors} onChange={handleChange} />;
      case 1:
        return <AddressForm formData={formData} errors={errors} onChange={handleChange} postalIndex={postalIndex} />;
      case 2:
        return <SchedulingForm formData={formData} errors={errors} onChange={handleChange} />;
      case 3:
        return <SpecialInstructionsForm formData={formData} errors={errors} onChange={handleChange} />;
      case 4:
        return (
          <SummaryPaymentStep
            formData={formData}
            paymentMethod={paymentMethod}
            onPaymentChange={handlePaymentChange}
            errors={errors}
          />
        );
      default:
        return null;
    }
  };

  if (successData) {
    return (
      <div className="min-h-screen bg-background">
        <RoleBasedNavigation userRole="customer" userName={userName} />
        <div className="pt-[60px]">
          <div className="max-w-3xl mx-auto px-4 md:px-6 lg:px-8 py-10 md:py-16">
            <div className="bg-card rounded-2xl border border-border shadow-elevation-md p-6 md:p-10 text-center">
              <div className="mx-auto w-14 h-14 rounded-full bg-success/10 flex items-center justify-center mb-4">
                <Icon name="CheckCircle" size={28} color="var(--color-success)" />
              </div>
              <h1 className="text-2xl md:text-3xl font-semibold text-foreground mb-2">
                Booking Successful
              </h1>
              <p className="text-sm md:text-base text-muted-foreground mb-6">
                Share this Delivery Access Code with the receiver if they need to track or message the courier.
              </p>

              <div className="w-full max-w-xl mx-auto bg-muted/40 border border-border rounded-xl px-4 py-3 md:px-6 md:py-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="text-left">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Tracking Code</p>
                    <p className="text-base md:text-lg font-semibold text-foreground">{successData?.bookingCode || 'N/A'}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    iconName="Copy"
                    iconPosition="left"
                    onClick={() => handleCopyCode(successData?.bookingCode, 'Tracking code')}
                  >
                    Copy Tracking Code
                  </Button>
                </div>
                <div className="border-t border-border pt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="text-left">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Delivery Access Code</p>
                    <p className="text-base md:text-lg font-semibold text-foreground">{successData?.deliveryAccessCode || 'N/A'}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    iconName="Copy"
                    iconPosition="left"
                    onClick={() => handleCopyCode(successData?.deliveryAccessCode, 'Delivery access code')}
                  >
                    Copy Code
                  </Button>
                </div>
              </div>
              {copyCodeFeedback ? (
                <p className="mt-2 text-xs text-muted-foreground">{copyCodeFeedback}</p>
              ) : null}

              <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
                <Button
                  variant="default"
                  iconName="MapPin"
                  iconPosition="left"
                  onClick={() => navigate(`/order-tracking?id=${encodeURIComponent(successData?.bookingCode || '')}`)}
                >
                  Track Order
                </Button>
                <Button
                  variant="secondary"
                  iconName="PackagePlus"
                  iconPosition="left"
                  onClick={() => navigate('/create-booking')}
                >
                  Create Another Booking
                </Button>
              </div>
            </div>
          </div>
        </div>
        <QuickActionPanel userRole="customer" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <RoleBasedNavigation userRole="customer" userName={userName} />
      <div className="pt-[60px]">
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-6 md:py-8 lg:py-12">
          <div className="mb-6 md:mb-8">
            <button
              onClick={() => navigate('/user-dashboard')}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
            >
              <Icon name="ArrowLeft" size={16} />
              Back to Dashboard
            </button>
            <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-foreground mb-2">Create New Booking</h1>
            <p className="text-sm md:text-base text-muted-foreground">Fill in the details to schedule your delivery</p>
          </div>

          <ProgressIndicator currentStep={currentStep} steps={steps} />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
            <div className="lg:col-span-2 space-y-6 md:space-y-8">
              {renderStepContent()}

              {isVerifying && (
                <div className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
                  Verifying Khalti payment. Please wait...
                </div>
              )}

              {submitError && (
                <div className="rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
                  {submitError}
                </div>
              )}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 md:gap-4 bg-card rounded-xl p-4 md:p-6 shadow-elevation-md">
                <Button
                  variant="outline"
                  onClick={handleSaveDraft}
                  loading={isSaving}
                  iconName="Save"
                  iconPosition="left"
                  className="w-full sm:w-auto"
                >
                  Save Draft
                </Button>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                  {currentStep > 0 && (
                    <Button
                      variant="secondary"
                      onClick={handlePrevious}
                      iconName="ChevronLeft"
                      iconPosition="left"
                      className="flex-1 sm:flex-none"
                    >
                      Previous
                    </Button>
                  )}
                  
                  {currentStep < steps?.length - 1 ? (
                    <Button
                      variant="default"
                      onClick={handleNext}
                      iconName="ChevronRight"
                      iconPosition="right"
                      className="flex-1 sm:flex-none"
                    >
                      Next Step
                    </Button>
                  ) : (
                    <Button
                      variant="default"
                      onClick={handleSubmit}
                      loading={isSubmitting}
                      iconName={paymentMethod === 'khalti' ? 'ArrowRight' : 'CheckCircle'}
                      iconPosition="left"
                      className="flex-1 sm:flex-none"
                    >
                      {paymentMethod === 'khalti' ? 'Proceed to Khalti' : 'Confirm Booking'}
                    </Button>
                  )}
                </div>
              </div>

              {showSaveConfirmation && (
                <div className="fixed bottom-6 right-6 bg-success text-success-foreground px-4 md:px-6 py-3 md:py-4 rounded-lg shadow-elevation-xl flex items-center gap-3 animate-slide-up z-50">
                  <Icon name="CheckCircle" size={20} />
                  <span className="text-sm md:text-base font-medium">Draft saved successfully!</span>
                </div>
              )}
            </div>

            <div className="lg:col-span-1">
              {currentStep < steps?.length - 1 && (
                <PricingCalculator formData={formData} />
              )}
            </div>
          </div>
        </div>
      </div>
      <QuickActionPanel userRole="customer" />
    </div>
  );
};

export default CreateBooking;
