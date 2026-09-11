// Central SEO configuration + JSON-LD (schema.org) builders for the public
// marketing site. Everything canonical/sitemap/structured-data derives from
// SITE_URL, so set NEXT_PUBLIC_BASE_URL to the production origin in prod.

export const SITE_URL = (process.env.NEXT_PUBLIC_BASE_URL || 'https://pristinehealthstaffing.com').replace(/\/$/, '');
export const SITE_NAME = 'Pristine Health Staffing';
export const SITE_SHORT = 'Pristine Health';
export const SITE_TAGLINE = 'Healthcare Staffing & In-Home Care Nationwide';
// The brand serves clients nationwide; WA is the launch market, not a limit.
// SITE_AREA is the phrase dropped into page copy ("...across the U.S.").
export const SITE_AREA = 'the U.S.';
export const SITE_COUNTRY = 'United States';
export const CONTACT_EMAIL = 'info@pristinehealthstaffing.com';

/** Absolute URL from a site-relative path. */
export function abs(path: string): string {
    return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

const LOGO = abs('/logo.png');
const OG_DEFAULT = abs('/healthcare_professionals_diversity.png');

/** Organization — emitted once (root/home). */
export function organizationLd() {
    return {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: SITE_NAME,
        url: SITE_URL,
        logo: LOGO,
        email: CONTACT_EMAIL,
        areaServed: { '@type': 'Country', name: SITE_COUNTRY },
        contactPoint: [{
            '@type': 'ContactPoint',
            contactType: 'customer service',
            email: CONTACT_EMAIL,
            areaServed: 'US',
            availableLanguage: ['English'],
        }],
    };
}

/** WebSite — emitted once (root/home). */
export function websiteLd() {
    return {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: SITE_NAME,
        url: SITE_URL,
    };
}

/** A marketing Service page (facility staffing or home care). */
export function serviceLd(opts: { name: string; description: string; path: string; serviceType?: string; areaServed?: string[] }) {
    return {
        '@context': 'https://schema.org',
        '@type': 'Service',
        name: opts.name,
        description: opts.description,
        serviceType: opts.serviceType || opts.name,
        url: abs(opts.path),
        provider: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL, logo: LOGO },
        areaServed: (opts.areaServed && opts.areaServed.length
            ? opts.areaServed.map((a) => ({ '@type': 'City', name: a }))
            : { '@type': 'Country', name: SITE_COUNTRY }),
    };
}

/** A city hub — LocalBusiness with areaServed. */
export function localBusinessLd(opts: { city: string; region?: string; path: string; description: string }) {
    return {
        '@context': 'https://schema.org',
        '@type': 'LocalBusiness',
        name: `${SITE_NAME} — ${opts.city}`,
        description: opts.description,
        url: abs(opts.path),
        image: OG_DEFAULT,
        email: CONTACT_EMAIL,
        areaServed: { '@type': 'City', name: opts.city },
        address: { '@type': 'PostalAddress', addressLocality: opts.city, addressRegion: opts.region || undefined, addressCountry: 'US' },
        parentOrganization: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
    };
}

/** Breadcrumbs for any nested page. `items` are {name, path}. */
export function breadcrumbLd(items: { name: string; path: string }[]) {
    return {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: items.map((it, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: it.name,
            item: abs(it.path),
        })),
    };
}

/** FAQ rich result — only when genuine Q&A exists on the page. */
export function faqLd(faqs: { q: string; a: string }[]) {
    return {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqs.map((f) => ({
            '@type': 'Question',
            name: f.q,
            acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
    };
}

/** Google for Jobs — one per job detail page. */
export function jobPostingLd(job: {
    title: string;
    description: string; // HTML
    datePosted: string | Date;
    validThrough?: string | Date | null;
    employmentType?: string | null;
    city?: string | null;
    region?: string | null;
    image?: string | null;
    url: string;
    salary?: { min?: number; max?: number; currency?: string; unit?: string } | null;
}) {
    const ld: Record<string, any> = {
        '@context': 'https://schema.org',
        '@type': 'JobPosting',
        title: job.title,
        description: job.description,
        datePosted: new Date(job.datePosted).toISOString(),
        hiringOrganization: { '@type': 'Organization', name: SITE_NAME, sameAs: SITE_URL, logo: LOGO },
        jobLocation: {
            '@type': 'Place',
            address: {
                '@type': 'PostalAddress',
                addressLocality: job.city || undefined,
                addressRegion: job.region || undefined,
                addressCountry: 'US',
            },
        },
        url: job.url,
        directApply: true,
    };
    if (job.validThrough) ld.validThrough = new Date(job.validThrough).toISOString();
    if (job.employmentType) ld.employmentType = job.employmentType;
    if (job.image) ld.image = job.image;
    if (job.salary && (job.salary.min || job.salary.max)) {
        ld.baseSalary = {
            '@type': 'MonetaryAmount',
            currency: job.salary.currency || 'USD',
            value: {
                '@type': 'QuantitativeValue',
                minValue: job.salary.min,
                maxValue: job.salary.max ?? job.salary.min,
                unitText: job.salary.unit || 'HOUR',
            },
        };
    }
    return ld;
}
