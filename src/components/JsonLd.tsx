// Renders a schema.org JSON-LD block as a server-side <script>. Accepts one
// object or an array of them. Safe: JSON.stringify with the standard XSS escape
// for embedding JSON in <script>.
export function JsonLd({ data }: { data: Record<string, any> | Record<string, any>[] }) {
    const json = JSON.stringify(data).replace(/</g, '\\u003c');
    return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
