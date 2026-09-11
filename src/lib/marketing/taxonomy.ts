// Content taxonomy for the marketing site (service × customer × geography).
// Data-driven so pages are statically generated and scaling = one entry, not a
// new file. Copy here is SEO-structured placeholder from the strategy — edit
// freely; structure (slug/keywords/faqs) is what the templates + schema use.

export interface ServiceEntry {
    slug: string;
    name: string;
    h1: string;
    metaTitle: string;
    metaDescription: string;
    keywords: string[];
    intro: string;
    highlights: string[];
    faqs: { q: string; a: string }[];
}

export interface LocationEntry {
    slug: string;
    city: string;
    region: string; // WA
    metaTitle: string;
    metaDescription: string;
    intro: string;
    faqs: { q: string; a: string }[];
}

const S = 'the U.S.';

export const facilityServices: ServiceEntry[] = [
    {
        slug: 'cna',
        name: 'CNA Staffing',
        h1: 'CNA Staffing for Senior Care & Healthcare Facilities',
        metaTitle: `CNA Staffing Agency in ${S} | ${'Pristine Health Staffing'}`,
        metaDescription: 'Reliable CNA staffing for nursing homes, assisted living and memory care nationwide — per diem, temporary, weekend and short-notice coverage.',
        keywords: ['CNA staffing agency', 'temporary CNA staffing', 'per diem CNA', 'short notice CNA staffing', 'nursing home CNA staffing'],
        intro: 'Pristine Health provides credentialed Certified Nursing Assistants to senior living, skilled nursing and memory care communities nationwide — for planned coverage, call-outs and short-notice gaps.',
        highlights: ['Per diem, temporary and contract CNAs', 'Short-notice and same-day call-out coverage', 'Weekend and overnight shifts', 'Credentialed, screened and reliable', 'Assisted living, skilled nursing and memory care experience'],
        faqs: [
            { q: 'How quickly can you fill a CNA shift?', a: 'For urgent call-outs we work to place a credentialed CNA on short notice, including same-day where availability allows.' },
            { q: 'Are your CNAs credentialed and screened?', a: 'Yes — every CNA is licensed, background-checked and screened before placement.' },
        ],
    },
    {
        slug: '1-to-1-support',
        name: '1:1 Sitter & Patient Support Staffing',
        h1: '1:1 Sitter & Patient Observer Staffing',
        metaTitle: `1:1 Sitter & Patient Observer Staffing in ${S} | Pristine Health Staffing`,
        metaDescription: 'Dedicated 1:1 sitter and patient observer staffing for hospitals and senior care facilities nationwide — reduce fall risk with reliable one-to-one supervision.',
        keywords: ['1:1 sitter staffing', 'patient sitter staffing', 'patient observer staffing', 'behavioral sitter staffing', 'hospital sitter staffing', '24 hour sitter care'],
        intro: 'Pristine Health provides dedicated 1:1 sitters and patient observers for facilities that need constant one-to-one supervision — supporting fall prevention, behavioral safety and continuous observation.',
        highlights: ['One-to-one patient observation and supervision', 'Fall-risk and behavioral safety support', 'Hospital, resident and behavioral sitters', 'Short-notice and around-the-clock coverage'],
        faqs: [
            { q: 'When does a resident need 1:1 supervision?', a: 'Common cases include elevated fall risk, behavioral safety concerns, elopement risk and post-incident observation. We staff dedicated sitters for continuous one-to-one supervision.' },
        ],
    },
    {
        slug: 'assisted-living',
        name: 'Assisted Living Staffing',
        h1: 'Reliable Staffing for Assisted Living Communities',
        metaTitle: `Assisted Living Staffing Agency in ${S} | Pristine Health Staffing`,
        metaDescription: 'Dependable CNA, caregiver and med tech staffing for assisted living communities nationwide — planned coverage and short-notice support.',
        keywords: ['assisted living staffing agency', 'assisted living CNA staffing', 'senior living staffing agency', 'temporary staff for assisted living', 'caregiver staffing for assisted living'],
        intro: 'Pristine Health keeps assisted living communities covered with dependable CNAs, caregivers and med techs — for planned schedules, call-outs and seasonal demand.',
        highlights: ['CNAs, caregivers and med techs', 'Short-notice and weekend coverage', 'Consistent, credentialed staff', 'Senior living experience'],
        faqs: [],
    },
    {
        slug: 'skilled-nursing',
        name: 'Skilled Nursing Staffing',
        h1: 'Staffing for Skilled Nursing Facilities',
        metaTitle: `Skilled Nursing (SNF) Staffing Agency in ${S} | Pristine Health Staffing`,
        metaDescription: 'CNA, LPN and RN staffing for skilled nursing facilities and nursing homes nationwide — per diem, temporary and contract coverage.',
        keywords: ['skilled nursing staffing agency', 'SNF staffing agency', 'nursing home CNA staffing', 'LPN staffing nursing homes', 'RN staffing skilled nursing facilities'],
        intro: 'Pristine Health provides CNAs, LPNs and RNs to skilled nursing facilities nationwide — for per diem, temporary and contract coverage that protects resident care.',
        highlights: ['CNA, LPN and RN coverage', 'Per diem, temporary and contract', 'Short-notice call-out support', 'Nursing home and SNF experience'],
        faqs: [],
    },
    {
        slug: 'memory-care',
        name: 'Memory Care Staffing',
        h1: 'Memory Care Staffing',
        metaTitle: `Memory Care Staffing Agency in ${S} | Pristine Health Staffing`,
        metaDescription: 'Compassionate, experienced CNA and caregiver staffing for memory care communities nationwide.',
        keywords: ['memory care staffing agency', 'memory care caregivers', 'CNA staffing memory care', 'temporary caregivers memory care'],
        intro: 'Pristine Health staffs memory care communities with compassionate, experienced CNAs and caregivers trained to support residents living with dementia and Alzheimer’s.',
        highlights: ['Dementia-experienced caregivers and CNAs', 'Short-notice and shortage coverage', 'Consistent, calm and reliable staff'],
        faqs: [],
    },
    {
        slug: 'lpn',
        name: 'LPN Staffing',
        h1: 'LPN Staffing for Healthcare Facilities',
        metaTitle: `LPN Staffing Agency in ${S} | Pristine Health Staffing`,
        metaDescription: 'Licensed Practical Nurse staffing for facilities nationwide — per diem, temporary and short-notice coverage.',
        keywords: ['LPN staffing agency', 'temporary LPN staffing', 'per diem LPN'],
        intro: 'Pristine Health provides Licensed Practical Nurses for facilities nationwide, from planned coverage to short-notice needs.',
        highlights: ['Per diem, temporary and contract LPNs', 'Short-notice coverage', 'Credentialed and screened'],
        faqs: [],
    },
    {
        slug: 'rn',
        name: 'RN Staffing',
        h1: 'RN Staffing for Healthcare Facilities',
        metaTitle: `RN Staffing Agency in ${S} | Pristine Health Staffing`,
        metaDescription: 'Registered Nurse staffing for facilities nationwide — per diem, temporary and short-notice coverage.',
        keywords: ['RN staffing agency', 'temporary RN staffing', 'per diem nursing staff'],
        intro: 'Pristine Health provides Registered Nurses for facilities nationwide, supporting planned schedules and short-notice coverage.',
        highlights: ['Per diem, temporary and contract RNs', 'Short-notice coverage', 'Credentialed and screened'],
        faqs: [],
    },
    {
        slug: 'med-tech',
        name: 'Med Tech Staffing',
        h1: 'Med Tech Staffing',
        metaTitle: `Med Tech Staffing Agency in ${S} | Pristine Health Staffing`,
        metaDescription: 'Medication technician staffing for assisted living and senior care communities nationwide.',
        keywords: ['med tech staffing agency', 'medication technician staffing', 'med tech staffing assisted living'],
        intro: 'Pristine Health provides qualified medication technicians for assisted living and senior care communities nationwide.',
        highlights: ['Qualified med techs', 'Short-notice and weekend coverage', 'Senior living experience'],
        faqs: [],
    },
    {
        slug: 'caregiver',
        name: 'Caregiver Staffing',
        h1: 'Caregiver Staffing for Senior Care',
        metaTitle: `Caregiver Staffing Agency in ${S} | Pristine Health Staffing`,
        metaDescription: 'Dependable caregiver staffing for senior living and care communities nationwide.',
        keywords: ['caregiver staffing agency', 'temporary caregivers', 'caregiver staffing for facilities'],
        intro: 'Pristine Health provides dependable caregivers for senior living and care communities nationwide — planned coverage and short-notice support.',
        highlights: ['Screened, reliable caregivers', 'Short-notice and weekend coverage', 'Senior care experience'],
        faqs: [],
    },
    {
        slug: 'behavioral-health',
        name: 'Behavioral Health Staffing',
        h1: 'Behavioral Health Staffing',
        metaTitle: `Behavioral Health Staffing Agency in ${S} | Pristine Health Staffing`,
        metaDescription: 'Staffing for behavioral health settings nationwide, including behavioral sitters and one-to-one support.',
        keywords: ['behavioral health staffing agency', 'behavioral sitter staffing', 'patient observer staffing'],
        intro: 'Pristine Health supports behavioral health settings nationwide with experienced staff and dedicated one-to-one behavioral sitters.',
        highlights: ['Behavioral sitters and observers', 'One-to-one safety support', 'Short-notice coverage'],
        faqs: [],
    },
    {
        slug: 'emergency-staffing',
        name: 'Emergency / Same-Day Staffing',
        h1: 'Emergency & Same-Day Healthcare Staffing',
        metaTitle: `Emergency & Same-Day Healthcare Staffing in ${S} | Pristine Health Staffing`,
        metaDescription: 'Short-notice and same-day healthcare staffing for facilities nationwide — cover call-outs and shift gaps fast.',
        keywords: ['emergency healthcare staffing', 'same day CNA staffing', 'last minute CNA staffing', 'short notice healthcare staffing', 'call out coverage nursing'],
        intro: 'Pristine Health specializes in fast coverage — when a facility has a call-out or a sudden shift gap, we work to place credentialed staff on short notice.',
        highlights: ['Short-notice and same-day placement', 'Call-out and shift-gap coverage', 'Weekend and overnight support', 'CNA, caregiver, med tech, LPN, RN and 1:1'],
        faqs: [
            { q: 'How do you handle last-minute CNA call-outs?', a: 'We maintain a pool of credentialed, screened staff and work to fill urgent shifts on short notice, including same-day coverage where availability allows.' },
        ],
    },
];

export const homeCareServices: ServiceEntry[] = [
    {
        slug: 'personal-care',
        name: 'Personal Care',
        h1: 'Personal Care at Home',
        metaTitle: `In-Home Personal Care for Seniors in ${S} | Pristine Health`,
        metaDescription: 'Compassionate in-home personal care for seniors nationwide — bathing, dressing, mobility and daily living support. Private pay, non-medical home care.',
        keywords: ['personal care for seniors', 'in home personal care', 'private pay home care', 'non medical home care'],
        intro: 'Pristine Health provides compassionate in-home personal care that helps seniors stay safely at home — support with bathing, dressing, grooming, mobility and everyday activities.',
        highlights: ['Bathing, dressing and grooming', 'Mobility and transfer support', 'Meal prep and medication reminders', 'Flexible, private-pay scheduling'],
        faqs: [
            { q: 'What does a home caregiver do?', a: 'Our caregivers help with personal care, companionship, meal preparation, light housekeeping, mobility and everyday activities so seniors can remain safely at home.' },
        ],
    },
    {
        slug: 'companion-care',
        name: 'Companion Care',
        h1: 'Companion Care for Seniors',
        metaTitle: `Companion Care for Seniors in ${S} | Pristine Health`,
        metaDescription: 'Friendly companion care for seniors nationwide — conversation, activities, errands and everyday support at home.',
        keywords: ['companion care for seniors', 'senior companion care', 'in home companion'],
        intro: 'Companion care from Pristine Health provides friendly company and everyday support — conversation, activities, errands, appointments and a watchful, caring presence at home.',
        highlights: ['Companionship and conversation', 'Errands and appointments', 'Light housekeeping and meals', 'Flexible scheduling'],
        faqs: [{ q: 'What’s the difference between companion care and personal care?', a: 'Companion care focuses on social support and everyday help; personal care adds hands-on assistance with bathing, dressing and mobility.' }],
    },
    {
        slug: 'respite-care',
        name: 'Respite Care',
        h1: 'Respite Care for Family Caregivers',
        metaTitle: `Respite Care in ${S} | Pristine Health`,
        metaDescription: 'Short-term respite care nationwide gives family caregivers a break while your loved one is cared for at home.',
        keywords: ['respite care near me', 'in home respite care', 'senior respite care'],
        intro: 'Respite care from Pristine Health gives family caregivers a much-needed break — dependable in-home care for your loved one for a few hours, a day or longer.',
        highlights: ['A few hours to overnight or longer', 'Personal care and companionship', 'Dependable, screened caregivers'],
        faqs: [{ q: 'How does respite care work?', a: 'We provide a caregiver to look after your loved one while you take a break — scheduled for the hours or days you need.' }],
    },
    {
        slug: 'dementia-care',
        name: 'Dementia & Memory Care',
        h1: 'Dementia & Alzheimer’s Care at Home',
        metaTitle: `Dementia & Alzheimer’s Home Care in ${S} | Pristine Health`,
        metaDescription: 'Specialized in-home dementia and Alzheimer’s care nationwide — patient, experienced caregivers who support safety and routine.',
        keywords: ['dementia care at home', 'Alzheimer’s home care', 'in home dementia care'],
        intro: 'Pristine Health provides patient, experienced in-home care for seniors living with dementia and Alzheimer’s — supporting safety, routine and dignity at home.',
        highlights: ['Dementia-experienced caregivers', 'Safety, routine and redirection', 'Personal care and companionship'],
        faqs: [],
    },
    {
        slug: 'overnight-care',
        name: 'Overnight Care',
        h1: 'Overnight Caregivers for Seniors',
        metaTitle: `Overnight Home Care in ${S} | Pristine Health`,
        metaDescription: 'Overnight caregivers nationwide provide safety, reassurance and support through the night at home.',
        keywords: ['overnight caregiver', 'overnight elderly care', 'overnight home care'],
        intro: 'Overnight care from Pristine Health provides reassurance and support through the night — help with toileting, mobility, safety and a caring presence so families can rest.',
        highlights: ['Nighttime safety and support', 'Toileting and mobility help', 'Reassuring presence overnight'],
        faqs: [{ q: 'Can someone stay overnight with my elderly parent?', a: 'Yes — we provide overnight caregivers who support safety, mobility and comfort through the night.' }],
    },
    {
        slug: '24-hour-care',
        name: '24-Hour Home Care',
        h1: '24-Hour Home Care',
        metaTitle: `24-Hour Home Care in ${S} | Pristine Health`,
        metaDescription: 'Around-the-clock in-home care nationwide — continuous support so seniors can remain safely at home.',
        keywords: ['24 hour home care', '24 hour care', 'around the clock home care'],
        intro: 'Pristine Health provides around-the-clock in-home care — continuous, dependable support so seniors with higher needs can remain safely at home.',
        highlights: ['Continuous 24/7 coverage', 'Personal care and safety support', 'Coordinated caregiver teams'],
        faqs: [{ q: 'How much does 24-hour home care cost?', a: 'Cost depends on care needs and schedule. Contact us for a personalized quote for around-the-clock care.' }],
    },
    {
        slug: 'post-hospital-care',
        name: 'Post-Hospital / Recovery Care',
        h1: 'Post-Hospital & Recovery Care at Home',
        metaTitle: `Post-Hospital Home Care in ${S} | Pristine Health`,
        metaDescription: 'In-home recovery support after a hospital stay nationwide — reduce readmission risk with help at home.',
        keywords: ['post hospital home care', 'home care after hospital discharge', 'recovery care at home'],
        intro: 'After a hospital stay, Pristine Health provides in-home recovery support — help with daily activities, mobility, reminders and safety to support a smooth recovery at home.',
        highlights: ['Support after discharge', 'Mobility and daily-activity help', 'Medication reminders and safety'],
        faqs: [],
    },
    {
        slug: '1-to-1-care',
        name: '1:1 Care',
        h1: 'One-to-One Care at Home',
        metaTitle: `1:1 In-Home Care in ${S} | Pristine Health`,
        metaDescription: 'Dedicated one-to-one in-home care nationwide for seniors who need focused, individualized support.',
        keywords: ['1:1 care', 'one to one home care', 'private caregiver'],
        intro: 'Pristine Health provides dedicated one-to-one in-home care — focused, individualized support for seniors who need close attention at home.',
        highlights: ['Dedicated, individualized care', 'Personal care and supervision', 'Flexible scheduling'],
        faqs: [],
    },
];

export const locations: LocationEntry[] = ([
    ['seattle-wa', 'Seattle'],
    ['bellevue-wa', 'Bellevue'],
    ['tacoma-wa', 'Tacoma'],
    ['everett-wa', 'Everett'],
    ['renton-wa', 'Renton'],
    ['kent-wa', 'Kent'],
    ['auburn-wa', 'Auburn'],
    ['federal-way-wa', 'Federal Way'],
    ['lynnwood-wa', 'Lynnwood'],
] as [string, string][]).map(([slug, city]) => ({
    slug,
    city,
    region: 'WA',
    metaTitle: `Healthcare Staffing & Home Care in ${city}, WA | Pristine Health`,
    metaDescription: `Pristine Health provides reliable healthcare staffing for facilities and personalized in-home care for families in ${city}, Washington — CNA, caregiver, med tech, LPN, RN, 1:1 support and senior home care.`,
    intro: `Pristine Health serves ${city} and the surrounding area with two connected services: dependable healthcare staffing for senior living, skilled nursing and memory care facilities, and personalized in-home care for families who want their loved ones to remain safely at home.`,
    faqs: [
        { q: `Do you provide home care in ${city}?`, a: `Yes — Pristine Health provides personal care, companion care, respite, dementia support and 24-hour/overnight in-home care for families in ${city} and nearby communities.` },
        { q: `Do you staff facilities in ${city}?`, a: `Yes — we provide CNA, caregiver, med tech, LPN, RN and 1:1 sitter staffing to facilities in ${city}, including short-notice coverage.` },
    ],
}));

// ── lookups ────────────────────────────────────────────────────────────────
export const getFacilityService = (slug: string) => facilityServices.find((s) => s.slug === slug);
export const getHomeCareService = (slug: string) => homeCareServices.find((s) => s.slug === slug);
export const getLocation = (slug: string) => locations.find((l) => l.slug === slug);
