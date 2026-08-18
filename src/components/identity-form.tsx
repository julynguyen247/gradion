"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { ArrowRightIcon, BookIcon, SparkleIcon } from "./icons";
import { Brand } from "./brand";
import { Spinner } from "./spinner";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function IdentityForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<{ name?: string; email?: string; form?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    api.getSession(controller.signal)
      .then(({ user }) => {
        if (user) router.replace("/projects");
        else setCheckingSession(false);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setCheckingSession(false);
      });
    return () => controller.abort();
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: typeof errors = {};
    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    if (cleanName.length < 2) nextErrors.name = "Enter your full name.";
    if (!EMAIL_PATTERN.test(cleanEmail)) nextErrors.email = "Enter a valid email address.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setSubmitting(true);
    try {
      await api.createSession({ name: cleanName, email: cleanEmail });
      router.replace("/projects");
      router.refresh();
    } catch (error) {
      setErrors({ form: error instanceof Error ? error.message : "We couldn't start your session." });
      setSubmitting(false);
    }
  }

  return (
    <main className="identity-page">
      <section className="identity-panel" aria-labelledby="identity-title">
        <div className="identity-form-wrap">
          <Brand linked={false} />
          <div className="identity-heading">
            <p className="eyebrow"><SparkleIcon /> Gemini-powered book illustration</p>
            <h1 id="identity-title">Turn every chapter into a world.</h1>
            <p>Start a new project or return to a story already in progress. No password needed.</p>
          </div>
          {checkingSession ? (
            <div className="session-check" role="status"><Spinner label="Checking your session" /> Checking your session…</div>
          ) : (
            <form className="form-stack" onSubmit={submit} noValidate>
              <div className="field-group">
                <label htmlFor="name">Full name</label>
                <input id="name" name="name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Mira Hassan" aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? "name-error" : undefined} autoFocus />
                {errors.name && <p className="field-error" id="name-error">{errors.name}</p>}
              </div>
              <div className="field-group">
                <label htmlFor="email">Email address</label>
                <input id="email" name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="mira@example.com" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "email-error" : "email-note"} />
                {errors.email ? <p className="field-error" id="email-error">{errors.email}</p> : <p className="field-note" id="email-note">Use the same email to resume your projects later.</p>}
              </div>
              {errors.form && <div className="form-alert" role="alert">{errors.form}</div>}
              <button className="button button-primary button-wide" type="submit" disabled={submitting}>
                {submitting ? <><Spinner label="Starting your studio" /> Opening your studio…</> : <>Continue <ArrowRightIcon /></>}
              </button>
            </form>
          )}
        </div>
      </section>
      <aside className="identity-art" aria-hidden="true">
        <div className="art-glow art-glow-one" /><div className="art-glow art-glow-two" />
        <div className="book-stack">
          <div className="book-card book-card-back"><span>05</span><SparkleIcon /></div>
          <div className="book-card book-card-middle"><span>03</span><BookIcon /></div>
          <div className="book-card book-card-front"><p>THE WIND IN<br />THE WILLOWS</p><span className="cover-line" /><small>AN ILLUSTRATED EDITION</small><div className="cover-moon"><SparkleIcon /></div></div>
        </div>
        <p className="art-caption">Five thoughtful steps.<br />One illustrated story.</p>
      </aside>
    </main>
  );
}
