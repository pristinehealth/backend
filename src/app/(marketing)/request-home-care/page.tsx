import type { Metadata } from "next";
import { IntakeForm, type IntakeField } from "@/components/marketing/IntakeForm";
import { RequestPageLayout } from "@/components/marketing/RequestPageLayout";
import { SITE_AREA } from "@/lib/seo";

const DESC = `Request in-home care for your loved one anywhere in ${SITE_AREA} — tell us what kind of care and when, and we’ll be in touch to help.`;

export const metadata: Metadata = {
    title: "Request Home Care for a Loved One",
    description: DESC,
    alternates: { canonical: "/request-home-care" },
    openGraph: { title: "Request Home Care for a Loved One", description: DESC, url: "/request-home-care" },
};

const FIELDS: IntakeField[] = [
    { name: "name", label: "Your name", type: "text", required: true, core: "name" },
    { name: "email", label: "Email", type: "email", required: true, core: "email" },
    { name: "phone", label: "Phone", type: "tel", core: "phone" },
    { name: "recipient", label: "Who is the care for?", type: "select", options: ["My parent", "My spouse", "Myself", "Another family member", "Other"] },
    { name: "careType", label: "Type of care needed", type: "checkboxes", options: ["Personal Care", "Companion Care", "Respite Care", "Dementia Care", "Overnight Care", "24-Hour Care"] },
    { name: "city", label: "City", type: "text", placeholder: "e.g. Bellevue" },
    { name: "hours", label: "How much care?", type: "select", options: ["A few hours a week", "Daily", "Overnight", "24-hour", "Not sure yet"] },
    { name: "start", label: "When would you like to start?", type: "select", options: ["As soon as possible", "Within a month", "Just exploring options"] },
    { name: "notes", label: "Anything else?", type: "textarea", placeholder: "Tell us about your loved one’s needs." },
];

export default function RequestHomeCarePage() {
    return (
        <RequestPageLayout crumbLabel="Home Care" crumbHref="/home-care" title="Request in-home care" description={DESC}>
            <IntakeForm fields={FIELDS} inquiryType="Home Care Request" submitLabel="Request home care"
                successMessage="Thanks — we’ve received your request and a care coordinator will reach out shortly." />
        </RequestPageLayout>
    );
}
