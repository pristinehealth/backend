import type { Metadata } from "next";
import { IntakeForm, type IntakeField } from "@/components/marketing/IntakeForm";
import { RequestPageLayout } from "@/components/marketing/RequestPageLayout";
import { facilityServices } from "@/lib/marketing/taxonomy";
import { SITE_AREA } from "@/lib/seo";

const DESC = `Request healthcare staffing for your facility anywhere in ${SITE_AREA} — tell us the roles, shifts and timing and we’ll respond quickly.`;

export const metadata: Metadata = {
    title: "Request Staffing for Your Facility",
    description: DESC,
    alternates: { canonical: "/request-staffing" },
    openGraph: { title: "Request Staffing for Your Facility", description: DESC, url: "/request-staffing" },
};

const FIELDS: IntakeField[] = [
    { name: "name", label: "Your name", type: "text", required: true, core: "name" },
    { name: "email", label: "Work email", type: "email", required: true, core: "email" },
    { name: "phone", label: "Phone", type: "tel", core: "phone" },
    { name: "facility", label: "Facility name", type: "text" },
    { name: "facilityType", label: "Facility type", type: "select", options: ["Assisted Living", "Skilled Nursing", "Memory Care", "Nursing Home", "Hospital", "Other"] },
    { name: "city", label: "City", type: "text", placeholder: "e.g. Seattle" },
    { name: "roles", label: "Roles needed", type: "checkboxes", options: facilityServices.filter((s) => !["assisted-living", "skilled-nursing", "memory-care", "behavioral-health", "emergency-staffing"].includes(s.slug)).map((s) => s.name.replace(" Staffing", "")) },
    { name: "shifts", label: "Shifts / schedule needed", type: "text", placeholder: "e.g. weekend NOC, 3 shifts/week" },
    { name: "urgency", label: "How soon?", type: "select", options: ["Urgent — this week", "This month", "Planning ahead"] },
    { name: "notes", label: "Anything else?", type: "textarea", placeholder: "Tell us more about your coverage needs." },
];

export default function RequestStaffingPage() {
    return (
        <RequestPageLayout crumbLabel="Facility Staffing" crumbHref="/facility-staffing" title="Request staffing for your facility" description={DESC}>
            <IntakeForm fields={FIELDS} inquiryType="Facility Staffing Request" submitLabel="Request staffing"
                successMessage="Thanks — we’ve received your staffing request and will be in touch shortly." />
        </RequestPageLayout>
    );
}
