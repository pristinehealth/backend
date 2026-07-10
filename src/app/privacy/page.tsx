import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — Pristine Health",
};

// NOTE: This is a general template for a US healthcare/home-care staffing
// company. Have it reviewed by legal counsel before relying on it.
const LAST_UPDATED = "July 2026";

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-5 py-12">
        <Link href="/jobs" className="text-sm font-bold text-brand-primary hover:text-brand-primary-dark">
          ← Back to careers
        </Link>

        <h1 className="mt-6 text-3xl md:text-4xl font-black text-text-primary tracking-tight">Privacy Policy</h1>
        <p className="mt-2 text-sm text-text-muted">Last updated: {LAST_UPDATED}</p>

        <div className="mt-8 space-y-8 text-sm leading-relaxed text-text-secondary">
          <section className="space-y-2">
            <p>
              Pristine Health (“we”, “us”, “our”) provides staffing services for supplemental and home care aides.
              This policy explains what personal information we collect when you apply for or hold a position with us,
              how we use it, and the choices you have.
            </p>
          </section>

          <Section title="1. Information we collect">
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Identity & contact:</strong> name, date of birth, email, phone, and address.</li>
              <li><strong>Employment details:</strong> profession, employment type, availability, and application answers.</li>
              <li><strong>Compliance & credentials:</strong> professional licenses, certifications, health clearances
                (e.g. TB, CPR/BLS), work authorization, government ID, and, where required, a Social Security Number —
                collected and retained per our compliance obligations.</li>
              <li><strong>Documents you upload</strong> in support of an application or your ongoing compliance.</li>
            </ul>
          </Section>

          <Section title="2. How we use it">
            <ul className="list-disc pl-5 space-y-1">
              <li>To evaluate your application and manage the hiring process.</li>
              <li>To verify credentials and maintain ongoing compliance (including expiry/renewal tracking).</li>
              <li>To contact you about your application, assignments, and required documents.</li>
              <li>To meet legal, regulatory, tax, and contractual obligations.</li>
            </ul>
          </Section>

          <Section title="3. Sensitive information">
            <p>
              Certain identifiers (such as Social Security Number, state ID, and work authorization) are handled with
              heightened care. Where practical we record only a verification receipt rather than storing the underlying
              document.
            </p>
          </Section>

          <Section title="4. How we share it">
            <p>
              We share information with service providers who help us operate (e.g. secure document storage and email),
              with clients/facilities where you are placed as necessary to staff an assignment, and with authorities
              where required by law. We do not sell your personal information.
            </p>
          </Section>

          <Section title="5. Retention & disposal">
            <p>
              We keep records for as long as needed for the purposes above and to meet legal retention requirements,
              after which they are securely disposed of. Retention periods vary by record type.
            </p>
          </Section>

          <Section title="6. Security">
            <p>
              We use administrative and technical safeguards to protect your information, including access controls and
              encrypted storage for uploaded documents. No system is perfectly secure, but we work to protect your data.
            </p>
          </Section>

          <Section title="7. Your choices & rights">
            <p>
              You may request access to, correction of, or deletion of your personal information, subject to our legal
              retention obligations. Contact us using the details below to make a request.
            </p>
          </Section>

          <Section title="8. Contact">
            <p>
              Questions about this policy or your data? Contact Pristine Health at{" "}
              <a href="mailto:privacy@pristinehealth.example" className="text-brand-primary hover:underline">
                privacy@pristinehealth.example
              </a>.
            </p>
          </Section>

          <p className="text-xs text-text-muted">
            See also our <Link href="/terms" className="text-brand-primary hover:underline">Terms of Service</Link>.
          </p>
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
