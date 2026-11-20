import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, CheckCircle2, Lock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  BUDGET_RANGES,
  CONSULTATION_MODES,
  COUNTRIES,
  DEGREES,
  ENGLISH_LEVELS,
  GENDERS,
  PASSPORT_STATUSES,
  PROCESSING_FEE,
  QUALIFICATIONS,
  STUDY_GAPS,
  TOTAL_STEPS,
  generateLeadId,
  isValidPakistaniWhatsapp,
  type LeadData,
  type LeadField,
} from "@/lib/lead";
import { sendLeadUpdate } from "@/lib/telegram.functions";

const STEP_TITLES = [
  "Where & what do you want to study?",
  "Your current balance & budget",
  "Application Confirmation",
  "Your academic profile",
  "Passport & contact details",
];

const CURRENT_YEAR = new Date().getFullYear();

type Errors = Partial<Record<LeadField, string>>;

function validateStep(step: number, d: LeadData): Errors {
  const e: Errors = {};
  const req = (k: LeadField, msg: string) => {
    if (!d[k] || !d[k]!.trim()) e[k] = msg;
  };
  if (step === 1) {
    req("country", "Please choose a country");
    req("degree", "Please choose a degree level");
  }
  if (step === 2) {
    req("currentBalance", "Please enter your current balance");
    req("budgetRange", "Please choose a budget range");
  }
  if (step === 4) {
    req("gender", "Please choose your gender");
    req("qualification", "Please choose your last qualification");
    const y = Number(d.passingYear);
    if (!d.passingYear || !Number.isInteger(y) || y < 1990 || y > CURRENT_YEAR + 1)
      e.passingYear = "Enter a valid year";
    req("marks", "Enter marks % or CGPA");
    req("english", "Please choose your English status");
    req("studyGap", "Please choose your study gap");
  }
  if (step === 5) {
    req("passportStatus", "Please choose passport status");
    req("consultationMode", "Please choose a consultation mode");
    if (!d.fullName || d.fullName.trim().length < 2) e.fullName = "Please enter your full name";
    req("city", "Please enter your city");
    if (!d.whatsapp || !isValidPakistaniWhatsapp(d.whatsapp))
      e.whatsapp = "Enter a valid number, e.g. 0300 1234567";
  }
  return e;
}

const fieldClass =
  "mt-1.5 block w-full rounded-lg border bg-form-card px-2.5 py-2.5 text-base text-form-text outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

function OptionGroup({
  id,
  label,
  options,
  value,
  onChange,
  error,
}: {
  id: string;
  label: React.ReactNode;
  options: readonly string[];
  value?: string | undefined;
  onChange: (v: string) => void;
  error?: string | undefined;
}) {
  return (
    <div>
      <label htmlFor={id} className="mt-3 block text-sm font-semibold text-form-text">
        {label}
      </label>
      <select
        id={id}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className={cn(fieldClass, "h-11 appearance-auto", error ? "border-destructive" : "border-form-border")}
      >
        <option value="" disabled>
          Select…
        </option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  error,
  placeholder,
  inputMode,
  prefix,
  maxLength = 100,
  autoComplete,
}: {
  id: string;
  label: React.ReactNode;
  value?: string | undefined;
  onChange: (v: string) => void;
  error?: string | undefined;
  placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  prefix?: string;
  maxLength?: number;
  autoComplete?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mt-3 block text-sm font-semibold text-form-text">
        {label}
        {prefix && <span className="font-normal text-muted-foreground"> ({prefix})</span>}
      </label>
      <input
        id={id}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        maxLength={maxLength}
        autoComplete={autoComplete}
        className={cn(fieldClass, "placeholder:text-muted-foreground/70", error ? "border-destructive" : "border-form-border")}
      />
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

function formatPkr(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 12);
  if (!digits) return "";
  return Number(digits).toLocaleString("en-PK");
}

export function EligibilityForm() {
  const [leadId, setLeadId] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [data, setData] = useState<LeadData>({});
  const [balanceInput, setBalanceInput] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [done, setDone] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);
  const send = useServerFn(sendLeadUpdate);

  // One Lead ID per visitor session of the form, created when the form opens.
  useEffect(() => {
    setLeadId(generateLeadId());
  }, []);

  const set = (k: LeadField, v: string) => {
    setData((d) => ({ ...d, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const fireUpdate = (s: number, snapshot: LeadData) => {
    if (!leadId) return;
    // Fire-and-forget: the visitor moves on instantly while the alert sends in the background.
    void send({ data: { leadId, step: s, data: snapshot } }).catch((err) =>
      console.error("Lead update failed", err),
    );
  };

  const scrollTop = () => topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const next = () => {
    const e = validateStep(step, data);
    if (Object.keys(e).length) {
      setErrors(e);
      return;
    }
    // Step 3 carries the processing charge the visitor has just confirmed.
    const snapshot: LeadData = step === 3 ? { ...data, processingFee: PROCESSING_FEE } : data;
    if (step === 3) setData(snapshot);
    fireUpdate(step, snapshot);
    if (step === TOTAL_STEPS) {
      setDone(true);
    } else {
      setStep(step + 1);
    }
    scrollTop();
  };

  const back = () => {
    setErrors({});
    setStep((s) => Math.max(1, s - 1));
    scrollTop();
  };

  if (done) {
    return (
      <div ref={topRef} className="mx-auto w-full max-w-[460px] animate-rise rounded-xl bg-form-card p-[22px] text-center font-form text-form-text shadow-form">
        <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-secondary text-success">
          <CheckCircle2 className="size-9" />
        </div>
        <h3 className="mt-4 font-form text-xl font-bold tracking-normal text-form-text">
          Thank you, {data.fullName?.split(" ")[0]}!
        </h3>
        <p className="mt-2 text-muted-foreground">
          Your eligibility request has been received. Our counsellor will contact you on WhatsApp at{" "}
          <span className="font-semibold text-foreground">{data.whatsapp}</span>.
        </p>
        <div className="mx-auto mt-5 inline-flex items-center gap-2 px-4 py-1.5 text-sm font-semibold text-primary stamp">
          Reference {leadId}
        </div>
      </div>
    );
  }

  const progress = (step / TOTAL_STEPS) * 100;

  return (
    <div ref={topRef} className="mx-auto w-full max-w-[460px] scroll-mt-32 rounded-xl bg-form-card p-[22px] font-form text-form-text shadow-form">
      <div className="mb-3 flex items-center justify-between text-xs font-semibold text-muted-foreground">
        <span>
          Step {step} of {TOTAL_STEPS}
        </span>
        {leadId && <span className="text-primary">{leadId}</span>}
      </div>
      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-form-bg" aria-hidden>
        <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>

      <h3 className="mb-2 font-form text-lg font-bold tracking-normal text-form-text">{STEP_TITLES[step - 1]}</h3>

      <div key={step} className="animate-rise space-y-1">
        {step === 1 && (
          <>
            <OptionGroup
              id="country"
              label="Target European country"
              options={COUNTRIES}
              value={data.country}
              onChange={(v) => set("country", v)}
              error={errors.country}
            />
            <OptionGroup
              id="degree"
              label="Degree level"
              options={DEGREES}
              value={data.degree}
              onChange={(v) => set("degree", v)}
              error={errors.degree}
            />
          </>
        )}

        {step === 2 && (
          <>
            <TextField
              id="currentBalance"
              label="Current Balance"
              prefix="PKR"
              inputMode="numeric"
              placeholder="e.g. 2,500,000"
              value={balanceInput}
              maxLength={16}
              onChange={(v) => {
                const f = formatPkr(v);
                setBalanceInput(f);
                set("currentBalance", f ? `PKR ${f}` : "");
              }}
              error={errors.currentBalance}
            />
            <OptionGroup
              id="budgetRange"
              label="Estimated study budget"
              options={BUDGET_RANGES}
              value={data.budgetRange}
              onChange={(v) => set("budgetRange", v)}
              error={errors.budgetRange}
            />
            <p className="!mt-4 flex items-start gap-2 rounded-lg bg-form-bg p-3 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
              No bank statement needed — just a rough figure so we can suggest options that fit.
            </p>
          </>
        )}

        {step === 3 && (
          <>
            <div className="mt-3 rounded-lg border border-form-border bg-form-bg p-4">
              <p className="text-sm font-semibold text-form-text">Application summary</p>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Country</dt>
                  <dd className="font-semibold text-form-text">{data.country || "—"}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Degree level</dt>
                  <dd className="font-semibold text-form-text">{data.degree || "—"}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-form-border pt-2">
                  <dt className="font-semibold text-form-text">Processing Charges</dt>
                  <dd className="text-base font-bold text-success">{PROCESSING_FEE}</dd>
                </div>
              </dl>
            </div>
            <p className="!mt-4 flex items-start gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
              This charge covers our team filling and checking your application form. Nothing is paid here — we
              send payment instructions on WhatsApp.
            </p>
          </>
        )}

        {step === 4 && (
          <>
            <OptionGroup
              id="gender"
              label="Gender"
              options={GENDERS}
              value={data.gender}
              onChange={(v) => set("gender", v)}
              error={errors.gender}
            />
            <OptionGroup
              id="qualification"
              label="Last completed qualification"
              options={QUALIFICATIONS}
              value={data.qualification}
              onChange={(v) => set("qualification", v)}
              error={errors.qualification}
            />
            <div className="grid grid-cols-2 gap-3">
              <TextField
                id="passingYear"
                label="Passing year"
                inputMode="numeric"
                placeholder={String(CURRENT_YEAR - 1)}
                maxLength={4}
                value={data.passingYear}
                onChange={(v) => set("passingYear", v.replace(/\D/g, ""))}
                error={errors.passingYear}
              />
              <TextField
                id="marks"
                label="Marks / CGPA"
                placeholder="78% or 3.2"
                maxLength={20}
                value={data.marks}
                onChange={(v) => set("marks", v)}
                error={errors.marks}
              />
            </div>
            <OptionGroup
              id="english"
              label="English proficiency"
              options={ENGLISH_LEVELS}
              value={data.english}
              onChange={(v) => set("english", v)}
              error={errors.english}
            />
            <OptionGroup
              id="studyGap"
              label="Study gap"
              options={STUDY_GAPS}
              value={data.studyGap}
              onChange={(v) => set("studyGap", v)}
              error={errors.studyGap}
            />
          </>
        )}

        {step === 5 && (
          <>
            <OptionGroup
              id="passportStatus"
              label="Passport status"
              options={PASSPORT_STATUSES}
              value={data.passportStatus}
              onChange={(v) => set("passportStatus", v)}
              error={errors.passportStatus}
            />
            <OptionGroup
              id="consultationMode"
              label="Preferred consultation mode"
              options={CONSULTATION_MODES}
              value={data.consultationMode}
              onChange={(v) => set("consultationMode", v)}
              error={errors.consultationMode}
            />
            <TextField
              id="fullName"
              label="Full name"
              placeholder="e.g. Ayesha Khan"
              autoComplete="name"
              value={data.fullName}
              onChange={(v) => set("fullName", v)}
              error={errors.fullName}
            />
            <TextField
              id="city"
              label="City in Pakistan"
              placeholder="e.g. Lahore"
              autoComplete="address-level2"
              value={data.city}
              onChange={(v) => set("city", v)}
              error={errors.city}
            />
            <TextField
              id="whatsapp"
              label="WhatsApp number"
              placeholder="0300 1234567"
              inputMode="tel"
              autoComplete="tel"
              maxLength={16}
              value={data.whatsapp}
              onChange={(v) => set("whatsapp", v)}
              error={errors.whatsapp}
            />
            <p className="!mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <Lock className="size-3.5 text-primary" /> Your details are only used to contact you about studying in
              Europe.
            </p>
          </>
        )}
      </div>

      <div className="mt-6 flex gap-2.5">
        {step > 1 && (
          <Button type="button" variant="outline" onClick={back} className="h-11 flex-1 rounded-lg border-form-border text-base">
            <ArrowLeft /> Back
          </Button>
        )}
        <Button
          type="button"
          variant={step === 3 ? "success" : "default"}
          onClick={next}
          className="h-11 flex-1 rounded-lg text-base font-semibold"
        >
          {step === TOTAL_STEPS ? "Submit" : step === 3 ? "Confirm & Continue" : "Next"}
          {step < TOTAL_STEPS && <ArrowRight />}
        </Button>
      </div>
    </div>
  );
        }
