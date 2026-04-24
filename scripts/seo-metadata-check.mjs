import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

const requiredFiles = [
  'src/app/robots.ts',
  'src/app/sitemap.ts',
  'src/app/layout.tsx',
  'src/app/page.tsx',
  'src/app/privacy/page.tsx',
  'src/app/terms/page.tsx',
  'src/app/refunds/page.tsx',
];

const mustContain = [
  { file: 'src/app/layout.tsx', snippets: ["metadataBase = new URL('https://zenzex.com')", 'openGraph:', 'twitter:'] },
  { file: 'src/app/page.tsx', snippets: ['canonical: \'/\'', 'application/ld+json', "'@type': 'Organization'", "'@type': 'SoftwareApplication'", "'@type': 'FAQPage'"] },
  { file: 'src/app/privacy/page.tsx', snippets: ["canonical: '/privacy'"] },
  { file: 'src/app/terms/page.tsx', snippets: ["canonical: '/terms'"] },
  { file: 'src/app/refunds/page.tsx', snippets: ["canonical: '/refunds'"] },
  { file: 'src/app/robots.ts', snippets: ["sitemap: `${appUrl}/sitemap.xml`"] },
  { file: 'src/app/sitemap.ts', snippets: ["const appUrl = 'https://zenzex.com'"] },
];

const noindexFiles = [
  'src/app/(auth)/layout.tsx',
  'src/app/auth/layout.tsx',
  'src/app/pay/layout.tsx',
  'src/app/(dashboard)/layout.tsx',
  'src/app/admin/layout.tsx',
  'src/app/account-unavailable/page.tsx',
  'src/app/dashboard-mockup/page.tsx',
  'src/app/invoice/view/[token]/page.tsx',
  'src/app/quote/view/[token]/page.tsx',
  'src/app/i/[id]/page.tsx',
];

const failures = [];

for (const rel of requiredFiles) {
  const fullPath = path.join(repoRoot, rel);
  if (!fs.existsSync(fullPath)) failures.push(`Missing required SEO file: ${rel}`);
}

for (const { file, snippets } of mustContain) {
  const fullPath = path.join(repoRoot, file);
  if (!fs.existsSync(fullPath)) {
    failures.push(`Missing file for content assertions: ${file}`);
    continue;
  }
  const content = fs.readFileSync(fullPath, 'utf8');
  for (const snippet of snippets) {
    if (!content.includes(snippet)) {
      failures.push(`Expected snippet not found in ${file}: ${snippet}`);
    }
  }
}

for (const file of noindexFiles) {
  const fullPath = path.join(repoRoot, file);
  if (!fs.existsSync(fullPath)) {
    failures.push(`Missing expected noindex file: ${file}`);
    continue;
  }
  const content = fs.readFileSync(fullPath, 'utf8');
  const hasNoindex = content.includes('robots:') && content.includes('index: false') && content.includes('follow: false');
  if (!hasNoindex) failures.push(`Expected noindex metadata not found in: ${file}`);
}

if (failures.length > 0) {
  console.error('SEO metadata guardrail failed:\n');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('SEO metadata guardrail passed.');
