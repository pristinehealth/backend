import OnboardingClient from "@/app/onboarding/OnboardingClient";

// Applicant onboarding — keyed on their accepted application.
export default async function Page({ params }: { params: Promise<{ applicationId: string }> }) {
    const { applicationId } = await params;
    return <OnboardingClient trackApiBase={`/api/onboarding/track/${applicationId}`} />;
}
