import OnboardingClient from "@/app/onboarding/OnboardingClient";

// Staff onboarding (Phase 3) — keyed on the person's EmployeeRecord, for a staff
// member with no application.
export default async function Page({ params }: { params: Promise<{ employeeRecordId: string }> }) {
    const { employeeRecordId } = await params;
    return <OnboardingClient trackApiBase={`/api/onboarding/track/by-record/${employeeRecordId}`} />;
}
