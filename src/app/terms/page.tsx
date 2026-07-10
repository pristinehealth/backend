import Link from "next/link";

export const metadata = {
  title: "Terms of Service — Pristine Health",
};

// NOTE: General template — have it reviewed by legal counsel before relying on it.
const LAST_UPDATED = "July 2026";

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-5 py-12">
        <Link href="/jobs" className="text-sm font-bold text-brand-primary hover:text-brand-primary-dark">
          ← Back to careers
        </Link>

        <h1 className="mt-6 text-3xl md:text-4xl font-black text-text-primary tracking-tight">Terms of Service</h1>
        <p className="mt-2 text-sm text-text-muted">Last updated: {LAST_UPDATED}</p>

        <div className="mt-8 space-y-8 text-sm leading-relaxed text-text-secondary">
          <section className="space-y-2">
            <p>
              These Terms govern your use of Pristine Health’s application and staffing services. By submitting an
              application, you agree to these Terms and to our{" "}
              <Link href="/privacy" className="text-brand-primary hover:underline">Privacy Policy</Link>.
            </p>
          </section>

          <Section title="1. Eligibility">
            <p>
              You must be legally authorized to work in the United States and meet the professional and compliance
              requirements for the role you apply to. You are responsible for maintaining valid credentials.
            </p>
          </Section>

          <Section title="2. Accurate information">
            <p>
              You agree to provide true, accurate, and complete information, and to keep your credentials and documents
              current. Providing false information, or failing to maintain required credentials, may result in
              disqualification or termination.
            </p>
          </Section>

          <Section title="3. Documents & credentials">
            <p>
              You authorize us to collect, verify, and retain the documents and credentials you provide for hiring and
              ongoing compliance, including tracking expiry and requesting renewals. Some credentials must be re-verified
              when they expire.
            </p>
          </Section>

          <Section title="4. Background & verification">
            <p>
              Placement may be conditional on background checks, reference checks, and credential verification, conducted
              in accordance with applicable law.
            </p>
          </Section>

          <Section title="5. Your account">
            <p>
              If you create login credentials, you are responsible for keeping them confidential and for activity under
              your account.
            </p>
          </Section>

          <Section title="6. Acceptable use">
            <p>
              You agree not to misuse the service, submit others’ information without authorization, or attempt to
              disrupt or gain unauthorized access to our systems.
            </p>
          </Section>

          <Section title="7. Disclaimers & liability">
            <p>
              The service is provided “as is.” To the maximum extent permitted by law, Pristine Health is not liable for
              indirect or consequential damages arising from your use of the service.
            </p>
          </Section>

          <Section title="8. Changes">
            <p>
              We may update these Terms from time to time. Continued use after changes constitutes acceptance of the
              updated Terms.
            </p>
          </Section>

          <Section title="9. Contact">
            <p>
              Questions? Contact Pristine Health at{" "}
              <a href="mailto:legal@pristinehealth.example" className="text-brand-primary hover:underline">
                legal@pristinehealth.example
              </a>.
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-black text-text-primary">{title}</h2>
      {children}
    </section>
  );
}
