"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/auth-context";
import { ApiError } from "@/lib/api";

type RegisterForm = {
  displayName: string;
  email: string;
  password: string;
  confirmPassword: string;
};

type FormFieldProps = {
  name: keyof RegisterForm;
  label: string;
  type?: string;
  placeholder?: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
};

function FormField({ name, label, type = "text", placeholder, value, error, onChange }: FormFieldProps) {
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <input
        id={name}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`input${error ? " error" : ""}`}
        autoComplete={type === "password" ? "new-password" : "off"}
      />
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();

  const [form, setForm] = useState<RegisterForm>({
    displayName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState("");
  const [loading, setLoading] = useState(false);

  function validate() {
    const e: Record<string, string> = {};
    if (!form.displayName.trim() || form.displayName.trim().length < 2)
      e.displayName = "Name must be at least 2 characters";
    if (!form.email.includes("@")) e.email = "Enter a valid email";
    if (form.password.length < 8) e.password = "Password must be at least 8 characters";
    else if (!/[A-Za-z]/.test(form.password)) e.password = "Password must contain a letter";
    else if (!/[0-9]/.test(form.password)) e.password = "Password must contain a number";
    if (form.password !== form.confirmPassword) e.confirmPassword = "Passwords do not match";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setApiError("");
    if (!validate()) return;
    setLoading(true);
    try {
      await register({
        email: form.email,
        password: form.password,
        displayName: form.displayName,
        nativeLanguage: "hi",
      });
      router.push("/onboarding");
    } catch (err) {
      setApiError(err instanceof ApiError ? err.message : "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function updateField(name: keyof RegisterForm, value: string) {
    setForm((f) => ({ ...f, [name]: value }));
    setErrors((er) => ({ ...er, [name]: "" }));
  }

  return (
    <div className="page-center">
      <div className="card">
        <div>
          <h1 className="page-title">Create your account</h1>
          <p className="page-subtitle">Start learning with <span className="brand">English Sathi</span> for free</p>
        </div>

        {apiError && <div className="alert alert-error" style={{ marginTop: "1rem" }}>{apiError}</div>}

        <form className="form" onSubmit={handleSubmit} noValidate>
          <FormField
            name="displayName"
            label="Your name"
            placeholder="e.g. Priya Sharma"
            value={form.displayName}
            error={errors.displayName}
            onChange={(v) => updateField("displayName", v)}
          />
          <FormField
            name="email"
            label="Email address"
            type="email"
            placeholder="you@example.com"
            value={form.email}
            error={errors.email}
            onChange={(v) => updateField("email", v)}
          />
          <FormField
            name="password"
            label="Password"
            type="password"
            placeholder="Min 8 chars with a number"
            value={form.password}
            error={errors.password}
            onChange={(v) => updateField("password", v)}
          />
          <FormField
            name="confirmPassword"
            label="Confirm password"
            type="password"
            placeholder="Same password again"
            value={form.confirmPassword}
            error={errors.confirmPassword}
            onChange={(v) => updateField("confirmPassword", v)}
          />

          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Creating account…</> : "Create Account"}
          </button>
        </form>

        <p style={{ textAlign: "center", marginTop: "1.5rem", fontSize: "0.9rem", color: "var(--text-muted)" }}>
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}

