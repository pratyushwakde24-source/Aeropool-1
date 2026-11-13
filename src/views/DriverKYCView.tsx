import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  FileCheck,
  CheckCircle2,
  Clock,
  XCircle,
  Upload,
  Shield,
  Car,
  AlertTriangle,
  Camera,
  FileText,
  Lock,
  Save,
  Send,
  Sparkles,
  ShieldCheck,
  Eye,
  Calendar,
  File,
  Check,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  User,
  X
} from 'lucide-react';
import { db } from '../services/db';
import { authService } from '../services/authService';
import { validateLicenseNumber, normalizeLicenseNumber } from '../utils/licenseNormalization';
import { DriverProfile, DriverDocument, VehicleCategory, VerificationStatus } from '../types';

interface DriverKYCViewProps {
  onNavigate: (route: string) => void;
}

interface UploadedDocState {
  id?: string;
  type: DriverDocument['type'];
  documentNumber: string;
  expiryDate?: string;
  fileUrl: string;
  downloadUrl?: string;
  fileName?: string;
  fileSizeBytes?: number;
  mimeType?: string;
  status: VerificationStatus;
  rejectionReason?: string;
  isUploading?: boolean;
}

export const DriverKYCView: React.FC<DriverKYCViewProps> = ({ onNavigate }) => {
  const [, setTick] = useState(0);
  useEffect(() => {
    const unsub = db.subscribe(() => setTick((t) => t + 1));
    return unsub;
  }, []);

  const currentUser = db.getState().currentUser;
  const existingDriver = currentUser
    ? db.getState().driverProfiles.find((d) => d.userId === currentUser.id)
    : null;

  // Active step (1: Personal, 2: Licence & Identity, 3: Vehicle & Compliance, 4: Review & Status)
  const [activeStep, setActiveStep] = useState<number>(() => {
    if (existingDriver?.verificationStatus === 'under_review' || existingDriver?.verificationStatus === 'approved') {
      return 4;
    }
    return 1;
  });

  // Step 1: Personal Details
  const [fullName, setFullName] = useState(existingDriver?.fullName || currentUser?.fullName || '');
  const [phone, setPhone] = useState(existingDriver?.phone || currentUser?.phone || '');
  const [email, setEmail] = useState(existingDriver?.email || currentUser?.email || '');
  const [residentialAddress, setResidentialAddress] = useState(existingDriver?.residentialAddress || '');
  const [emergencyContact, setEmergencyContact] = useState(existingDriver?.emergencyContact || '');
  const [profilePhotoUrl, setProfilePhotoUrl] = useState(existingDriver?.profilePhotoUrl || '');
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  // Step 2: Driving Licence & Identity
  const [licenseNumber, setLicenseNumber] = useState(existingDriver?.licenseNumber || '');
  const [licenseExpiryDate, setLicenseExpiryDate] = useState(existingDriver?.licenseExpiryDate || '');
  const [badgeNumber, setBadgeNumber] = useState(existingDriver?.badgeNumber || '');

  // Step 3: Vehicle Details
  const [vehiclePlate, setVehiclePlate] = useState(existingDriver?.assignedVehicle?.plateNumber || '');
  const [vehicleModel, setVehicleModel] = useState(existingDriver?.assignedVehicle?.makeModel || '');
  const [vehicleCategory, setVehicleCategory] = useState<VehicleCategory>(
    existingDriver?.assignedVehicle?.category || 'Sedan'
  );
  const [vehicleColor, setVehicleColor] = useState(existingDriver?.assignedVehicle?.color || 'Silver');
  const [seatCapacity, setSeatCapacity] = useState<number>(existingDriver?.assignedVehicle?.seats || 4);
  const [luggageCapacity, setLuggageCapacity] = useState<number>(
    existingDriver?.assignedVehicle?.luggageLimit || 3
  );

  // Vehicle Compliance Numbers & Expiry
  const [rcNumber, setRcNumber] = useState(existingDriver?.assignedVehicle?.rcNumber || '');
  const [rcExpiryDate, setRcExpiryDate] = useState(existingDriver?.assignedVehicle?.rcExpiryDate || '');
  const [insuranceNumber, setInsuranceNumber] = useState(existingDriver?.assignedVehicle?.insuranceNumber || '');
  const [insuranceExpiryDate, setInsuranceExpiryDate] = useState(existingDriver?.assignedVehicle?.insuranceExpiryDate || '');
  const [pucNumber, setPucNumber] = useState(existingDriver?.assignedVehicle?.pucNumber || '');
  const [pucExpiryDate, setPucExpiryDate] = useState(existingDriver?.assignedVehicle?.pucExpiryDate || '');

  // Documents state map
  const [docsMap, setDocsMap] = useState<Record<string, UploadedDocState>>(() => {
    const initial: Record<string, UploadedDocState> = {};
    if (existingDriver?.documents) {
      existingDriver.documents.forEach((d) => {
        initial[d.type] = {
          id: d.id,
          type: d.type,
          documentNumber: d.documentNumber,
          expiryDate: d.expiryDate,
          fileUrl: d.fileUrl,
          downloadUrl: d.downloadUrl || d.fileUrl,
          fileName: d.fileName,
          fileSizeBytes: d.fileSizeBytes,
          mimeType: d.mimeType,
          status: d.status,
          rejectionReason: d.rejectionReason,
        };
      });
    }
    return initial;
  });

  // Affirmations
  const [commissionAffirmed, setCommissionAffirmed] = useState(true);
  const [termsAgreed, setTermsAgreed] = useState(false);

  // Lightbox preview modal state
  const [previewDoc, setPreviewDoc] = useState<{
    title: string;
    url: string;
    mimeType?: string;
    number?: string;
    expiry?: string;
  } | null>(null);

  // UI Feedback
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync when existingDriver changes
  useEffect(() => {
    if (existingDriver) {
      if (!licenseNumber && existingDriver.licenseNumber) setLicenseNumber(existingDriver.licenseNumber);
      if (!vehiclePlate && existingDriver.assignedVehicle?.plateNumber) setVehiclePlate(existingDriver.assignedVehicle.plateNumber);
      if (existingDriver.documents && Object.keys(docsMap).length === 0) {
        const nextMap: Record<string, UploadedDocState> = {};
        existingDriver.documents.forEach((d) => {
          nextMap[d.type] = {
            id: d.id,
            type: d.type,
            documentNumber: d.documentNumber,
            expiryDate: d.expiryDate,
            fileUrl: d.fileUrl,
            downloadUrl: d.downloadUrl || d.fileUrl,
            fileName: d.fileName,
            fileSizeBytes: d.fileSizeBytes,
            mimeType: d.mimeType,
            status: d.status,
            rejectionReason: d.rejectionReason,
          };
        });
        setDocsMap(nextMap);
      }
    }
  }, [existingDriver]);

  if (!currentUser) {
    return (
      <div className="min-h-[75vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full glass-panel border border-slate-800 rounded-3xl p-8 text-center space-y-4 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center mx-auto text-sky-400">
            <Car className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-extrabold text-white">Authentication Required</h2>
          <p className="text-xs text-slate-400">
            Please sign in or register your AeroPool driver account to access KYC Onboarding.
          </p>
          <button
            onClick={() => onNavigate('/')}
            className="w-full h-11 bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg transition active:scale-[0.98]"
          >
            Return to AeroPool Home
          </button>
        </div>
      </div>
    );
  }

  // Upload handler for documents (calls /api/driver/upload-document with fallback to local base64)
  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    docType: DriverDocument['type'],
    docNumberVal: string,
    expiryVal?: string
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate size (5MB ceiling)
    const maxSizeBytes = 5 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      setFeedback({
        type: 'error',
        message: `File "${file.name}" exceeds 5MB limit. Please compress or select a smaller scan.`,
      });
      return;
    }

    // Validate MIME type
    const allowedMime = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowedMime.includes(file.type)) {
      setFeedback({
        type: 'error',
        message: 'Unsupported file format. Please upload JPEG, PNG, WebP or PDF documents.',
      });
      return;
    }

    setFeedback(null);
    setDocsMap((prev) => ({
      ...prev,
      [docType]: {
        ...(prev[docType] || {}),
        type: docType,
        documentNumber: docNumberVal || 'PENDING',
        expiryDate: expiryVal,
        fileName: file.name,
        fileSizeBytes: file.size,
        mimeType: file.type,
        status: 'under_review',
        fileUrl: prev[docType]?.fileUrl || '',
        isUploading: true,
      },
    }));

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Data = reader.result as string;

        try {
          // Retrieve authenticated bearer token from authService
          const token = await authService.getAccessToken();
          if (!token) {
            setFeedback({
              type: 'error',
              message: 'Authentication session expired or missing. Please sign in to upload documents.',
            });
            setDocsMap((prev) => ({
              ...prev,
              [docType]: {
                ...(prev[docType] || {}),
                type: docType,
                documentNumber: docNumberVal || '',
                expiryDate: expiryVal,
                fileName: file.name,
                fileSizeBytes: file.size,
                mimeType: file.type,
                fileUrl: '',
                downloadUrl: '',
                status: 'pending',
                isUploading: false,
              },
            }));
            return;
          }

          const apiRes = await fetch('/api/driver/upload-document', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              driverId: currentUser.id,
              documentType: docType,
              documentNumber: docNumberVal || docType,
              expiryDate: expiryVal,
              fileName: file.name,
              mimeType: file.type,
              fileBase64: base64Data,
              callerRole: 'driver',
            }),
          });

          if (!apiRes.ok) {
            let errorDetail = `Upload rejected (${apiRes.status})`;
            try {
              const errJson = await apiRes.json();
              if (errJson.error) errorDetail = errJson.error;
            } catch {
              // Non-JSON response
            }
            throw new Error(errorDetail);
          }

          const data = await apiRes.json();
          if (!data.success || !data.document) {
            throw new Error(data.error || 'Server did not return a valid document record.');
          }

          const uploadedDoc = data.document;
          setDocsMap((prev) => ({
            ...prev,
            [docType]: {
              type: docType,
              documentNumber: docNumberVal || 'DOCUMENTED',
              expiryDate: expiryVal,
              fileName: file.name,
              fileSizeBytes: file.size,
              mimeType: file.type,
              fileUrl: uploadedDoc.storagePath || uploadedDoc.id,
              downloadUrl: uploadedDoc.previewUrl,
              status: 'under_review',
              isUploading: false,
            },
          }));

          setFeedback({
            type: 'success',
            message: `${docType.replace(/_/g, ' ')} uploaded successfully.`,
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Upload transmission error';
          setFeedback({
            type: 'error',
            message: `Upload failed: ${msg}. Document was not saved. Please retry.`,
          });
          // Mark document as not uploaded (do not fall back to local base64 state)
          setDocsMap((prev) => ({
            ...prev,
            [docType]: {
              ...(prev[docType] || {}),
              type: docType,
              documentNumber: docNumberVal || '',
              expiryDate: expiryVal,
              fileName: file.name,
              fileSizeBytes: file.size,
              mimeType: file.type,
              fileUrl: '',
              downloadUrl: '',
              status: 'pending',
              isUploading: false,
            },
          }));
        }
      };
      reader.readAsDataURL(file);
    } catch {
      setFeedback({ type: 'error', message: 'Failed to process document file locally. Please try another file.' });
      setDocsMap((prev) => ({
        ...prev,
        [docType]: { ...(prev[docType] || {}), isUploading: false },
      }));
    }
  };

  // Upload handler for profile photo
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setFeedback({ type: 'error', message: 'Profile photo must be JPEG, PNG, or WebP.' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setFeedback({ type: 'error', message: 'Photo must be under 5MB.' });
      return;
    }

    setIsUploadingPhoto(true);
    setFeedback(null);

    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = reader.result as string;
      setProfilePhotoUrl(base64Data);
      setIsUploadingPhoto(false);
      setFeedback({ type: 'success', message: 'Profile photo updated.' });
    };
    reader.readAsDataURL(file);
  };

  // Save draft or submit application
  const handleSaveOrSubmit = (isDraft: boolean) => {
    const licValidation = validateLicenseNumber(licenseNumber);
    if (!licenseNumber.trim()) {
      setFeedback({ type: 'error', message: 'Driving licence number is required.' });
      setActiveStep(2);
      return;
    }

    if (!isDraft) {
      if (!licValidation.isValid) {
        setFeedback({ type: 'error', message: licValidation.error || 'Valid commercial driving licence number is required.' });
        setActiveStep(2);
        return;
      }
      if (!vehiclePlate.trim()) {
        setFeedback({ type: 'error', message: 'Vehicle registration plate number is required.' });
        setActiveStep(3);
        return;
      }
      if (!termsAgreed) {
        setFeedback({
          type: 'error',
          message: 'Please review and accept the AeroPool Partner Driver Terms & Conditions.',
        });
        return;
      }
    }

    setIsSubmitting(true);
    setFeedback(null);

    const canonicalLicense = licValidation.isValid ? licValidation.canonical : normalizeLicenseNumber(licenseNumber);

    // Build documents list
    const documentsList: Array<{
      type: DriverDocument['type'];
      documentNumber: string;
      fileUrl: string;
      expiryDate?: string;
      fileSizeBytes?: number;
      mimeType?: string;
      fileName?: string;
      downloadUrl?: string;
    }> = Object.values(docsMap)
      .filter((d) => d.fileUrl || d.documentNumber)
      .map((d) => ({
        type: d.type,
        documentNumber: d.documentNumber || canonicalLicense,
        fileUrl: d.fileUrl || `private-storage://drivers/${currentUser.id}/${d.type.toLowerCase()}`,
        expiryDate: d.expiryDate,
        fileSizeBytes: d.fileSizeBytes,
        mimeType: d.mimeType,
        fileName: d.fileName,
        downloadUrl: d.downloadUrl,
      }));

    // If Driving Licence Front wasn't added to docsMap but DL number is entered
    if (!documentsList.some((d) => d.type === 'DRIVING_LICENSE' || d.type === 'DRIVING_LICENSE_FRONT')) {
      documentsList.push({
        type: 'DRIVING_LICENSE',
        documentNumber: canonicalLicense,
        fileUrl: `private-storage://drivers/${currentUser.id}/dl_${canonicalLicense}`,
        expiryDate: licenseExpiryDate || undefined,
      });
    }

    const res = db.submitDriverApplication({
      userId: currentUser.id,
      fullName: fullName.trim() || currentUser.fullName,
      phone: phone.trim() || currentUser.phone || '',
      email: email.trim() || currentUser.email,
      residentialAddress: residentialAddress.trim(),
      emergencyContact: emergencyContact.trim(),
      licenseNumber: canonicalLicense,
      licenseExpiryDate: licenseExpiryDate || undefined,
      badgeNumber: badgeNumber.trim().toUpperCase() || undefined,
      profilePhotoUrl: profilePhotoUrl || undefined,
      vehiclePlate: vehiclePlate.trim().toUpperCase() || undefined,
      vehicleModel: vehicleModel.trim() || 'Commercial Cab',
      vehicleCategory,
      vehicleColor,
      vehicleRcNumber: rcNumber.trim().toUpperCase() || undefined,
      vehicleRcExpiryDate: rcExpiryDate || undefined,
      vehicleInsuranceNumber: insuranceNumber.trim() || undefined,
      vehicleInsuranceExpiryDate: insuranceExpiryDate || undefined,
      vehiclePucNumber: pucNumber.trim() || undefined,
      vehiclePucExpiryDate: pucExpiryDate || undefined,
      seatCapacity,
      luggageCapacity,
      documents: documentsList,
      isDraft,
    });

    setIsSubmitting(false);

    if (res.success) {
      if (isDraft) {
        setFeedback({
          type: 'success',
          message: 'Draft application saved. You can resume anytime without losing progress.',
        });
      } else {
        setFeedback({
          type: 'success',
          message:
            'Application submitted successfully! Our compliance team reviews documents within 4 business hours.',
        });
        setActiveStep(4);
      }
    } else {
      setFeedback({
        type: 'error',
        message: res.error || 'Failed to submit driver application.',
      });
    }
  };

  const status = existingDriver?.verificationStatus || 'draft';

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 py-6 sm:py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Breadcrumb Navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => onNavigate('/')}
            className="flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-white transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to AeroPool</span>
          </button>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-slate-400">Driver Partner Portal</span>
            <div className="h-1.5 w-1.5 rounded-full bg-sky-400" />
            <span className="text-[11px] font-mono text-sky-400">CSMIA Mumbai Hub</span>
          </div>
        </div>

        {/* Header Hero Banner */}
        <div className="glass-panel border border-slate-800 rounded-3xl p-6 sm:p-8 bg-gradient-to-br from-slate-900/90 via-[#070b14] to-sky-950/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative z-10">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs font-semibold mb-3">
                <Sparkles className="w-3.5 h-3.5" />
                <span>80% Fare Direct Driver Payout</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                Driver Registration & KYC Verification
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-2 max-w-xl">
                Join Mumbai's premier airport rideshare network. Complete your background screening, upload commercial licence, RC and insurance to activate your cockpit.
              </p>
            </div>

            {/* Current Application Status Badge */}
            <div className="flex flex-col items-start sm:items-end gap-2 shrink-0">
              <div className="text-[10px] uppercase font-mono text-slate-400">Onboarding Status</div>
              <span
                className={`inline-flex items-center gap-1.5 text-xs font-bold font-mono px-3.5 py-1.5 rounded-xl border ${
                  status === 'approved'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : status === 'rejected'
                    ? 'bg-red-500/10 text-red-400 border-red-500/30'
                    : status === 'suspended'
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                    : status === 'under_review'
                    ? 'bg-sky-500/10 text-sky-400 border-sky-500/30 animate-pulse'
                    : 'bg-slate-800 text-slate-300 border-slate-700'
                }`}
              >
                {status === 'approved' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                {status === 'rejected' && <XCircle className="w-4 h-4 text-red-400" />}
                {status === 'under_review' && <Clock className="w-4 h-4 text-sky-400" />}
                {status === 'draft' && <FileText className="w-4 h-4 text-slate-400" />}
                <span className="uppercase">{status.replace(/_/g, ' ')}</span>
              </span>

              {status === 'approved' && (
                <button
                  onClick={() => onNavigate('/driver')}
                  className="mt-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg transition flex items-center gap-2"
                >
                  <Car className="w-4 h-4" />
                  <span>Open Driver Cockpit</span>
                </button>
              )}
            </div>
          </div>

          {/* Stepper Wizard Progress */}
          <div className="mt-8 pt-6 border-t border-slate-800/80 grid grid-cols-4 gap-2 sm:gap-4">
            {[
              { num: 1, label: 'Personal', icon: User },
              { num: 2, label: 'Licence & KYC', icon: FileCheck },
              { num: 3, label: 'Vehicle', icon: Car },
              { num: 4, label: 'Review', icon: ShieldCheck },
            ].map((s) => {
              const isCurrent = activeStep === s.num;
              const isPassed = activeStep > s.num || (s.num < 4 && status === 'approved');
              const IconComp = s.icon;
              return (
                <button
                  key={s.num}
                  onClick={() => setActiveStep(s.num)}
                  className={`text-left p-2.5 sm:p-3 rounded-xl border transition flex items-center gap-2.5 ${
                    isCurrent
                      ? 'bg-sky-500/10 border-sky-500/40 text-white shadow-sm'
                      : isPassed
                      ? 'bg-slate-900/60 border-slate-800 text-emerald-400 hover:border-slate-700'
                      : 'bg-slate-950/40 border-slate-800/60 text-slate-500 hover:border-slate-700'
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                      isCurrent
                        ? 'bg-sky-500 text-slate-950'
                        : isPassed
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {isPassed && !isCurrent ? <Check className="w-3.5 h-3.5" /> : s.num}
                  </div>
                  <div className="hidden sm:block truncate">
                    <div className="text-[11px] font-bold">{s.label}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Feedback Alert Banner */}
        {feedback && (
          <div
            className={`p-4 rounded-2xl border text-xs flex items-center justify-between gap-3 ${
              feedback.type === 'success'
                ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                : 'bg-red-950/40 border-red-500/30 text-red-300'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
              )}
              <span>{feedback.message}</span>
            </div>
            <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Rejection / Resubmission Notice */}
        {status === 'rejected' && existingDriver?.rejectionReason && (
          <div className="glass-panel border border-red-500/30 bg-red-950/20 rounded-2xl p-4 sm:p-5 text-xs text-red-200 space-y-2">
            <div className="flex items-center gap-2 text-red-400 font-bold uppercase tracking-wider text-[11px]">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <span>Application Resubmission Required</span>
            </div>
            <p>
              <strong>Compliance Officer Feedback:</strong> {existingDriver.rejectionReason}
            </p>
            <p className="text-slate-400 text-[11px]">
              Please update the rejected documents or details highlighted below and re-submit for expedited verification.
            </p>
          </div>
        )}

        {/* STEP 1: Personal Details */}
        {activeStep === 1 && (
          <div className="glass-panel border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div>
                <h2 className="text-lg font-bold text-white">Step 1: Personal Profile</h2>
                <p className="text-xs text-slate-400 mt-0.5">Your official identity for passenger safety and regulatory compliance.</p>
              </div>
              <User className="w-5 h-5 text-sky-400" />
            </div>

            {/* Profile Photo Upload */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-6 p-4 bg-slate-950/60 rounded-2xl border border-slate-800/80">
              <div className="relative group shrink-0">
                {profilePhotoUrl ? (
                  <img
                    src={profilePhotoUrl}
                    alt="Driver Portrait"
                    className="w-24 h-24 rounded-2xl object-cover border-2 border-sky-400 shadow-lg"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-2xl bg-slate-900 border-2 border-dashed border-slate-700 flex flex-col items-center justify-center text-slate-500 gap-1">
                    <Camera className="w-6 h-6" />
                    <span className="text-[10px]">Photo</span>
                  </div>
                )}
                {isUploadingPhoto && (
                  <div className="absolute inset-0 bg-slate-950/70 rounded-2xl flex items-center justify-center">
                    <RefreshCw className="w-5 h-5 text-sky-400 animate-spin" />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="text-xs font-bold text-white">Driver Partner Profile Photograph</div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Upload a clear, front-facing colour portrait with neutral background. Max 5MB (JPEG, PNG, WebP). Used on passenger boarding screens.
                </p>
                <label className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 cursor-pointer transition">
                  <Upload className="w-3.5 h-3.5 text-sky-400" />
                  <span>Select Portrait Image</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handlePhotoUpload}
                  />
                </label>
              </div>
            </div>

            {/* Form Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Full Legal Name (as per Driving Licence) *
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Ramesh Kumar Sharma"
                  className="w-full h-11 px-3.5 bg-slate-950/80 border border-slate-800 rounded-xl text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-sky-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Mobile Number (OTP Verified) *
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98200 12345"
                  className="w-full h-11 px-3.5 bg-slate-950/80 border border-slate-800 rounded-xl text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-sky-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Email Address *
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="driver@example.com"
                  className="w-full h-11 px-3.5 bg-slate-950/80 border border-slate-800 rounded-xl text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-sky-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Emergency Contact / Next of Kin Phone
                </label>
                <input
                  type="tel"
                  value={emergencyContact}
                  onChange={(e) => setEmergencyContact(e.target.value)}
                  placeholder="+91 98111 22334"
                  className="w-full h-11 px-3.5 bg-slate-950/80 border border-slate-800 rounded-xl text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-sky-500 transition"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Residential Address (Mumbai MMR / Navi Mumbai / Thane)
                </label>
                <textarea
                  rows={2}
                  value={residentialAddress}
                  onChange={(e) => setResidentialAddress(e.target.value)}
                  placeholder="e.g. Flat 302, Sai Vihar, Andheri East, Mumbai 400069"
                  className="w-full p-3 bg-slate-950/80 border border-slate-800 rounded-xl text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-sky-500 transition"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => handleSaveOrSubmit(true)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl border border-slate-700 transition flex items-center gap-2"
              >
                <Save className="w-3.5 h-3.5 text-slate-400" />
                <span>Save Draft</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveStep(2)}
                className="px-5 py-2.5 bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg transition flex items-center gap-2"
              >
                <span>Continue to Step 2: Licence & KYC</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Licence & Identity Verification */}
        {activeStep === 2 && (
          <div className="glass-panel border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div>
                <h2 className="text-lg font-bold text-white">Step 2: Driving Licence & Regulatory KYC</h2>
                <p className="text-xs text-slate-400 mt-0.5">Commercial driving credentials validated under Motor Vehicles Act.</p>
              </div>
              <FileCheck className="w-5 h-5 text-sky-400" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Driving Licence (DL) Number *
                </label>
                <input
                  type="text"
                  value={licenseNumber}
                  onChange={(e) => setLicenseNumber(e.target.value.toUpperCase())}
                  placeholder="e.g. MH0120200012345"
                  className="w-full h-11 px-3.5 bg-slate-950/80 border border-slate-800 rounded-xl text-white text-xs font-mono uppercase placeholder:text-slate-600 focus:outline-none focus:border-sky-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Driving Licence Expiry Date *
                </label>
                <input
                  type="date"
                  value={licenseExpiryDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setLicenseExpiryDate(e.target.value)}
                  className="w-full h-11 px-3.5 bg-slate-950/80 border border-slate-800 rounded-xl text-white text-xs font-mono focus:outline-none focus:border-sky-500 transition"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Commercial PSV Badge Number (Optional for private rides)
                </label>
                <input
                  type="text"
                  value={badgeNumber}
                  onChange={(e) => setBadgeNumber(e.target.value.toUpperCase())}
                  placeholder="e.g. BDG-MMR-88421"
                  className="w-full h-11 px-3.5 bg-slate-950/80 border border-slate-800 rounded-xl text-white text-xs font-mono uppercase placeholder:text-slate-600 focus:outline-none focus:border-sky-500 transition"
                />
              </div>
            </div>

            {/* Document Upload Cards */}
            <div className="space-y-4 pt-2">
              <div className="text-xs font-bold text-white uppercase tracking-wider">Required Document Scans</div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* DL Front */}
                <DocUploadCard
                  title="Driving Licence (Front)"
                  description="Clear photo or PDF showing name, DL number and photo"
                  docType="DRIVING_LICENSE_FRONT"
                  docNumberVal={licenseNumber}
                  expiryVal={licenseExpiryDate}
                  docState={docsMap['DRIVING_LICENSE_FRONT'] || docsMap['DRIVING_LICENSE']}
                  onUpload={(e) => handleFileUpload(e, 'DRIVING_LICENSE_FRONT', licenseNumber, licenseExpiryDate)}
                  onPreview={() =>
                    setPreviewDoc({
                      title: 'Driving Licence (Front)',
                      url: docsMap['DRIVING_LICENSE_FRONT']?.downloadUrl || docsMap['DRIVING_LICENSE']?.downloadUrl || '',
                      mimeType: docsMap['DRIVING_LICENSE_FRONT']?.mimeType,
                      number: licenseNumber,
                      expiry: licenseExpiryDate,
                    })
                  }
                />

                {/* DL Back */}
                <DocUploadCard
                  title="Driving Licence (Back)"
                  description="Back side showing transport endorsement and validity"
                  docType="DRIVING_LICENSE_BACK"
                  docNumberVal={licenseNumber}
                  expiryVal={licenseExpiryDate}
                  docState={docsMap['DRIVING_LICENSE_BACK']}
                  onUpload={(e) => handleFileUpload(e, 'DRIVING_LICENSE_BACK', licenseNumber, licenseExpiryDate)}
                  onPreview={() =>
                    setPreviewDoc({
                      title: 'Driving Licence (Back)',
                      url: docsMap['DRIVING_LICENSE_BACK']?.downloadUrl || '',
                      mimeType: docsMap['DRIVING_LICENSE_BACK']?.mimeType,
                      number: licenseNumber,
                      expiry: licenseExpiryDate,
                    })
                  }
                />

                {/* Police Clearance / Verification */}
                <DocUploadCard
                  title="Police Verification Certificate"
                  description="Police verification certificate or character clearance"
                  docType="POLICE_VERIFICATION"
                  docNumberVal="POLICE-CLEARANCE"
                  docState={docsMap['POLICE_VERIFICATION']}
                  onUpload={(e) => handleFileUpload(e, 'POLICE_VERIFICATION', 'POLICE-CLEARANCE')}
                  onPreview={() =>
                    setPreviewDoc({
                      title: 'Police Verification Certificate',
                      url: docsMap['POLICE_VERIFICATION']?.downloadUrl || '',
                      mimeType: docsMap['POLICE_VERIFICATION']?.mimeType,
                    })
                  }
                />

                {/* Identity Proof (Aadhaar / PAN) */}
                <DocUploadCard
                  title="Aadhaar or Government Identity"
                  description="Government issued identity verification proof"
                  docType="IDENTITY_PROOF"
                  docNumberVal="GOVT-ID"
                  docState={docsMap['IDENTITY_PROOF']}
                  onUpload={(e) => handleFileUpload(e, 'IDENTITY_PROOF', 'GOVT-ID')}
                  onPreview={() =>
                    setPreviewDoc({
                      title: 'Government Identity Proof',
                      url: docsMap['IDENTITY_PROOF']?.downloadUrl || '',
                      mimeType: docsMap['IDENTITY_PROOF']?.mimeType,
                    })
                  }
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setActiveStep(1)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl border border-slate-700 transition"
              >
                Back to Step 1
              </button>

              <button
                type="button"
                onClick={() => setActiveStep(3)}
                className="px-5 py-2.5 bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg transition flex items-center gap-2"
              >
                <span>Continue to Step 3: Vehicle & RC</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Vehicle & Compliance */}
        {activeStep === 3 && (
          <div className="glass-panel border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div>
                <h2 className="text-lg font-bold text-white">Step 3: Vehicle Registration & Compliance</h2>
                <p className="text-xs text-slate-400 mt-0.5">Vehicle registration certificate, commercial insurance & PUC validity.</p>
              </div>
              <Car className="w-5 h-5 text-sky-400" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Vehicle Plate Number *
                </label>
                <input
                  type="text"
                  value={vehiclePlate}
                  onChange={(e) => setVehiclePlate(e.target.value.toUpperCase())}
                  placeholder="e.g. MH01AB1234"
                  className="w-full h-11 px-3.5 bg-slate-950/80 border border-slate-800 rounded-xl text-white text-xs font-mono uppercase placeholder:text-slate-600 focus:outline-none focus:border-sky-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Make & Model *
                </label>
                <input
                  type="text"
                  value={vehicleModel}
                  onChange={(e) => setVehicleModel(e.target.value)}
                  placeholder="e.g. Maruti Suzuki Ertiga"
                  className="w-full h-11 px-3.5 bg-slate-950/80 border border-slate-800 rounded-xl text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-sky-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Category
                </label>
                <select
                  value={vehicleCategory}
                  onChange={(e) => setVehicleCategory(e.target.value as VehicleCategory)}
                  className="w-full h-11 px-3.5 bg-slate-950/80 border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:border-sky-500 transition"
                >
                  <option value="Sedan">Sedan (Dzire, Amaze)</option>
                  <option value="SUV">SUV (Ertiga, Innova)</option>
                  <option value="Hatchback">Hatchback (WagonR, Swift)</option>
                  <option value="Premium">Premium (Innova Hycross, Camry)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Vehicle Colour
                </label>
                <input
                  type="text"
                  value={vehicleColor}
                  onChange={(e) => setVehicleColor(e.target.value)}
                  placeholder="e.g. White, Silver, Grey"
                  className="w-full h-11 px-3.5 bg-slate-950/80 border border-slate-800 rounded-xl text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-sky-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Passenger Seating Capacity
                </label>
                <select
                  value={seatCapacity}
                  onChange={(e) => setSeatCapacity(Number(e.target.value))}
                  className="w-full h-11 px-3.5 bg-slate-950/80 border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:border-sky-500 transition"
                >
                  <option value={4}>4 Passengers (Standard Cab)</option>
                  <option value={6}>6 Passengers (Ertiga / XL6)</option>
                  <option value={7}>7 Passengers (Innova Crysta)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Luggage Trunk Capacity
                </label>
                <select
                  value={luggageCapacity}
                  onChange={(e) => setLuggageCapacity(Number(e.target.value))}
                  className="w-full h-11 px-3.5 bg-slate-950/80 border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:border-sky-500 transition"
                >
                  <option value={2}>2 Large Suitcases</option>
                  <option value={3}>3 Large Suitcases</option>
                  <option value={4}>4 Large Suitcases</option>
                  <option value={5}>5 Large Suitcases</option>
                </select>
              </div>
            </div>

            {/* Vehicle Documents & Expiries */}
            <div className="space-y-4 pt-2">
              <div className="text-xs font-bold text-white uppercase tracking-wider">
                Vehicle Compliance Certificates & Documents
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* RC */}
                <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-2xl space-y-3">
                  <div className="font-bold text-xs text-white flex items-center justify-between">
                    <span>Registration Certificate (RC)</span>
                    <Car className="w-4 h-4 text-sky-400" />
                  </div>
                  <input
                    type="text"
                    value={rcNumber}
                    onChange={(e) => setRcNumber(e.target.value.toUpperCase())}
                    placeholder="RC Number"
                    className="w-full h-9 px-3 bg-slate-900 border border-slate-800 rounded-lg text-white text-xs font-mono uppercase focus:outline-none focus:border-sky-500"
                  />
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">RC Expiry Date</label>
                    <input
                      type="date"
                      value={rcExpiryDate}
                      min={new Date().toISOString().split('T')[0]}
                      onChange={(e) => setRcExpiryDate(e.target.value)}
                      className="w-full h-8 px-2.5 bg-slate-900 border border-slate-800 rounded-lg text-white text-xs font-mono focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <DocUploadCard
                    title="RC Document Scan"
                    description="Clear scan of RC book or smart card"
                    docType="VEHICLE_RC"
                    docNumberVal={rcNumber}
                    expiryVal={rcExpiryDate}
                    docState={docsMap['VEHICLE_RC']}
                    onUpload={(e) => handleFileUpload(e, 'VEHICLE_RC', rcNumber, rcExpiryDate)}
                    onPreview={() =>
                      setPreviewDoc({
                        title: 'Vehicle Registration Certificate (RC)',
                        url: docsMap['VEHICLE_RC']?.downloadUrl || '',
                        mimeType: docsMap['VEHICLE_RC']?.mimeType,
                        number: rcNumber,
                        expiry: rcExpiryDate,
                      })
                    }
                  />
                </div>

                {/* Insurance */}
                <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-2xl space-y-3">
                  <div className="font-bold text-xs text-white flex items-center justify-between">
                    <span>Commercial Insurance</span>
                    <Shield className="w-4 h-4 text-emerald-400" />
                  </div>
                  <input
                    type="text"
                    value={insuranceNumber}
                    onChange={(e) => setInsuranceNumber(e.target.value)}
                    placeholder="Policy Number"
                    className="w-full h-9 px-3 bg-slate-900 border border-slate-800 rounded-lg text-white text-xs font-mono focus:outline-none focus:border-sky-500"
                  />
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Insurance Expiry Date</label>
                    <input
                      type="date"
                      value={insuranceExpiryDate}
                      min={new Date().toISOString().split('T')[0]}
                      onChange={(e) => setInsuranceExpiryDate(e.target.value)}
                      className="w-full h-8 px-2.5 bg-slate-900 border border-slate-800 rounded-lg text-white text-xs font-mono focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <DocUploadCard
                    title="Insurance Policy Scan"
                    description="Valid commercial third-party / comprehensive"
                    docType="VEHICLE_INSURANCE"
                    docNumberVal={insuranceNumber}
                    expiryVal={insuranceExpiryDate}
                    docState={docsMap['VEHICLE_INSURANCE']}
                    onUpload={(e) => handleFileUpload(e, 'VEHICLE_INSURANCE', insuranceNumber, insuranceExpiryDate)}
                    onPreview={() =>
                      setPreviewDoc({
                        title: 'Vehicle Commercial Insurance Policy',
                        url: docsMap['VEHICLE_INSURANCE']?.downloadUrl || '',
                        mimeType: docsMap['VEHICLE_INSURANCE']?.mimeType,
                        number: insuranceNumber,
                        expiry: insuranceExpiryDate,
                      })
                    }
                  />
                </div>

                {/* PUC */}
                <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-2xl space-y-3">
                  <div className="font-bold text-xs text-white flex items-center justify-between">
                    <span>PUC Certificate</span>
                    <ShieldCheck className="w-4 h-4 text-teal-400" />
                  </div>
                  <input
                    type="text"
                    value={pucNumber}
                    onChange={(e) => setPucNumber(e.target.value.toUpperCase())}
                    placeholder="PUC Number"
                    className="w-full h-9 px-3 bg-slate-900 border border-slate-800 rounded-lg text-white text-xs font-mono uppercase focus:outline-none focus:border-sky-500"
                  />
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">PUC Expiry Date</label>
                    <input
                      type="date"
                      value={pucExpiryDate}
                      min={new Date().toISOString().split('T')[0]}
                      onChange={(e) => setPucExpiryDate(e.target.value)}
                      className="w-full h-8 px-2.5 bg-slate-900 border border-slate-800 rounded-lg text-white text-xs font-mono focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <DocUploadCard
                    title="PUC Certificate Scan"
                    description="Current pollution under control certificate"
                    docType="VEHICLE_PUC"
                    docNumberVal={pucNumber}
                    expiryVal={pucExpiryDate}
                    docState={docsMap['VEHICLE_PUC']}
                    onUpload={(e) => handleFileUpload(e, 'VEHICLE_PUC', pucNumber, pucExpiryDate)}
                    onPreview={() =>
                      setPreviewDoc({
                        title: 'Pollution Under Control (PUC) Certificate',
                        url: docsMap['VEHICLE_PUC']?.downloadUrl || '',
                        mimeType: docsMap['VEHICLE_PUC']?.mimeType,
                        number: pucNumber,
                        expiry: pucExpiryDate,
                      })
                    }
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setActiveStep(2)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl border border-slate-700 transition"
              >
                Back to Step 2
              </button>

              <button
                type="button"
                onClick={() => setActiveStep(4)}
                className="px-5 py-2.5 bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg transition flex items-center gap-2"
              >
                <span>Continue to Step 4: Review & Submit</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: Review, Declarations & Submission */}
        {activeStep === 4 && (
          <div className="glass-panel border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div>
                <h2 className="text-lg font-bold text-white">Step 4: Application Review & Compliance Submission</h2>
                <p className="text-xs text-slate-400 mt-0.5">Verify your details before final submission to the AeroPool Compliance Office.</p>
              </div>
              <ShieldCheck className="w-5 h-5 text-sky-400" />
            </div>

            {/* Summary Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-slate-950/70 border border-slate-800 rounded-2xl text-xs">
              <div>
                <div className="text-slate-400 text-[11px] uppercase tracking-wider">Driver Profile</div>
                <div className="text-white font-bold mt-1">{fullName || currentUser.fullName}</div>
                <div className="text-slate-400 font-mono text-[11px]">{phone || currentUser.phone}</div>
                <div className="text-slate-400 text-[11px] truncate">{email || currentUser.email}</div>
              </div>

              <div>
                <div className="text-slate-400 text-[11px] uppercase tracking-wider">Licence & Identity</div>
                <div className="text-sky-400 font-mono font-bold mt-1">{licenseNumber || 'NOT ENTERED'}</div>
                <div className="text-slate-400 text-[11px]">Expires: {licenseExpiryDate || 'Not specified'}</div>
                <div className="text-slate-400 text-[11px]">Badge: {badgeNumber || 'None'}</div>
              </div>

              <div>
                <div className="text-slate-400 text-[11px] uppercase tracking-wider">Commercial Vehicle</div>
                <div className="text-emerald-400 font-mono font-bold mt-1">{vehiclePlate || 'NOT REGISTERED'}</div>
                <div className="text-slate-300 text-[11px]">{vehicleModel || 'Cab'} ({vehicleCategory})</div>
                <div className="text-slate-400 text-[11px]">{seatCapacity} Seats • {luggageCapacity} Luggage Limit</div>
              </div>
            </div>

            {/* Document Verification Checklist */}
            <div className="space-y-3">
              <div className="text-xs font-bold text-white uppercase tracking-wider">Submitted Document Inventory</div>
              <div className="divide-y divide-slate-800/80 rounded-2xl border border-slate-800 bg-slate-950/40 overflow-hidden">
                {[
                  { label: 'Driving Licence (Front)', type: 'DRIVING_LICENSE_FRONT' },
                  { label: 'Driving Licence (Back)', type: 'DRIVING_LICENSE_BACK' },
                  { label: 'Vehicle Registration Certificate (RC)', type: 'VEHICLE_RC' },
                  { label: 'Commercial Vehicle Insurance', type: 'VEHICLE_INSURANCE' },
                  { label: 'Pollution Under Control (PUC)', type: 'VEHICLE_PUC' },
                  { label: 'Police Verification Certificate', type: 'POLICE_VERIFICATION' },
                  { label: 'Identity Proof (Aadhaar / PAN)', type: 'IDENTITY_PROOF' },
                ].map((item) => {
                  const doc = docsMap[item.type] || (item.type === 'DRIVING_LICENSE_FRONT' ? docsMap['DRIVING_LICENSE'] : undefined);
                  const isUploaded = Boolean(doc?.fileUrl);
                  return (
                    <div key={item.type} className="p-3.5 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                            isUploaded ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'
                          }`}
                        >
                          {isUploaded ? <Check className="w-3.5 h-3.5" /> : <File className="w-3.5 h-3.5" />}
                        </div>
                        <div>
                          <div className="font-semibold text-white">{item.label}</div>
                          <div className="text-[11px] text-slate-400 font-mono">
                            {doc?.fileName || (isUploaded ? 'File Attached' : 'Not uploaded')}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {isUploaded && (
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewDoc({
                                title: item.label,
                                url: doc?.downloadUrl || doc?.fileUrl || '',
                                mimeType: doc?.mimeType,
                                number: doc?.documentNumber,
                                expiry: doc?.expiryDate,
                              })
                            }
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] rounded-lg border border-slate-700 transition flex items-center gap-1.5"
                          >
                            <Eye className="w-3.5 h-3.5 text-sky-400" />
                            <span>Preview</span>
                          </button>
                        )}
                        <span
                          className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-md font-semibold ${
                            doc?.status === 'approved'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                              : doc?.status === 'rejected'
                              ? 'bg-red-500/10 text-red-400 border border-red-500/30'
                              : isUploaded
                              ? 'bg-sky-500/10 text-sky-400 border border-sky-500/30'
                              : 'bg-slate-800 text-slate-500'
                          }`}
                        >
                          {doc?.status ? doc.status.replace(/_/g, ' ') : 'Pending Upload'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Commission Affirmation & Terms */}
            <div className="p-4 bg-sky-950/20 border border-sky-500/30 rounded-2xl space-y-3 text-xs">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={commissionAffirmed}
                  onChange={(e) => setCommissionAffirmed(e.target.checked)}
                  className="mt-0.5 rounded border-slate-700 text-sky-500 focus:ring-sky-500"
                />
                <span className="text-slate-300 leading-relaxed">
                  <strong>80/20 Driver Commission Acknowledgment:</strong> I acknowledge and accept that AeroPool operates on an 80% driver payout model, deducting a fixed 20% platform commission on passenger trip fares.
                </span>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={termsAgreed}
                  onChange={(e) => setTermsAgreed(e.target.checked)}
                  className="mt-0.5 rounded border-slate-700 text-sky-500 focus:ring-sky-500"
                />
                <span className="text-slate-300 leading-relaxed">
                  <strong>Declaration of Authenticity:</strong> I declare that all documents, licences and vehicle registration numbers submitted herein are genuine and currently valid. Any misrepresentation will result in immediate disqualification and regulatory reporting.
                </span>
              </label>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setActiveStep(3)}
                className="w-full sm:w-auto px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl border border-slate-700 transition"
              >
                Back to Vehicle Details
              </button>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => handleSaveOrSubmit(true)}
                  disabled={isSubmitting}
                  className="flex-1 sm:flex-none px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl border border-slate-700 transition flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4 text-slate-400" />
                  <span>Save Draft</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSaveOrSubmit(false)}
                  disabled={isSubmitting || !termsAgreed}
                  className={`flex-1 sm:flex-none px-6 py-2.5 text-xs font-bold rounded-xl shadow-lg transition flex items-center justify-center gap-2 ${
                    isSubmitting || !termsAgreed
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      : 'bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-slate-950 active:scale-[0.98]'
                  }`}
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Submit Complete KYC Application</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Document Lightbox Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="max-w-2xl w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-white">{previewDoc.title}</h3>
                {previewDoc.number && (
                  <p className="text-xs font-mono text-sky-400 mt-0.5">Doc No: {previewDoc.number}</p>
                )}
                {previewDoc.expiry && (
                  <p className="text-[11px] text-slate-400">Expires: {previewDoc.expiry}</p>
                )}
              </div>
              <button
                onClick={() => setPreviewDoc(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="min-h-[280px] max-h-[60vh] overflow-auto rounded-xl bg-slate-950 flex items-center justify-center p-4 border border-slate-800">
              {previewDoc.mimeType === 'application/pdf' || previewDoc.url.endsWith('.pdf') ? (
                <div className="text-center space-y-3 p-6">
                  <FileText className="w-16 h-16 text-sky-400 mx-auto" />
                  <p className="text-xs text-slate-300 font-semibold">Portable Document Format (PDF)</p>
                  <a
                    href={previewDoc.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold rounded-xl transition shadow"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open PDF in Secure Viewer</span>
                  </a>
                </div>
              ) : previewDoc.url ? (
                <img
                  src={previewDoc.url}
                  alt={previewDoc.title}
                  className="max-h-[55vh] object-contain rounded-lg shadow-lg"
                />
              ) : (
                <div className="text-slate-500 text-xs">No preview available for this document scan.</div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setPreviewDoc(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Reusable Document Upload Card Sub-component
interface DocUploadCardProps {
  title: string;
  description: string;
  docType: DriverDocument['type'];
  docNumberVal: string;
  expiryVal?: string;
  docState?: UploadedDocState;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onPreview: () => void;
}

const DocUploadCard: React.FC<DocUploadCardProps> = ({
  title,
  description,
  docType,
  docState,
  onUpload,
  onPreview,
}) => {
  const isUploaded = Boolean(docState?.fileUrl);
  const isRejected = docState?.status === 'rejected';
  const isApproved = docState?.status === 'approved';

  return (
    <div
      className={`p-4 rounded-2xl border transition space-y-3 ${
        isRejected
          ? 'bg-red-950/20 border-red-500/40'
          : isApproved
          ? 'bg-emerald-950/20 border-emerald-500/30'
          : isUploaded
          ? 'bg-slate-900/80 border-slate-700'
          : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-bold text-xs text-white flex items-center gap-1.5">
            <span>{title}</span>
            {isApproved && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
            {isRejected && <AlertTriangle className="w-3.5 h-3.5 text-red-400" />}
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">{description}</p>
        </div>

        {isUploaded && (
          <span
            className={`text-[9px] uppercase font-mono px-2 py-0.5 rounded font-semibold ${
              isApproved
                ? 'bg-emerald-500/10 text-emerald-400'
                : isRejected
                ? 'bg-red-500/10 text-red-400'
                : 'bg-sky-500/10 text-sky-400'
            }`}
          >
            {docState?.status ? docState.status.replace(/_/g, ' ') : 'Attached'}
          </span>
        )}
      </div>

      {docState?.fileName && (
        <div className="text-[11px] text-slate-300 font-mono flex items-center gap-1 truncate">
          <File className="w-3 h-3 text-slate-500 shrink-0" />
          <span className="truncate">{docState.fileName}</span>
          {docState.fileSizeBytes && (
            <span className="text-[10px] text-slate-500 shrink-0">
              ({(docState.fileSizeBytes / 1024).toFixed(0)} KB)
            </span>
          )}
        </div>
      )}

      {isRejected && docState?.rejectionReason && (
        <div className="text-[11px] text-red-300 bg-red-950/40 p-2 rounded-lg border border-red-500/20">
          Reason: {docState.rejectionReason}
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <label className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 cursor-pointer transition">
          {docState?.isUploading ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 text-sky-400 animate-spin" />
              <span>Uploading...</span>
            </>
          ) : (
            <>
              <Upload className="w-3.5 h-3.5 text-sky-400" />
              <span>{isUploaded ? 'Re-upload' : 'Upload File'}</span>
            </>
          )}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="hidden"
            disabled={docState?.isUploading}
            onChange={onUpload}
          />
        </label>

        {isUploaded && (
          <button
            type="button"
            onClick={onPreview}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition flex items-center gap-1"
          >
            <Eye className="w-3.5 h-3.5 text-sky-400" />
            <span>View</span>
          </button>
        )}
      </div>
    </div>
  );
};
