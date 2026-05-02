export type LandingTestimonial = {
  id: string;
  name: string;
  role: string;
  avatarUrl: string;
  quote: string;
};

export const LANDING_TESTIMONIALS: LandingTestimonial[] = [
  {
    id: 'maya',
    name: 'Maya Chen',
    role: 'Freelance designer',
    avatarUrl: 'https://ui-avatars.com/api/?name=Maya+Chen&background=e2e8f0&color=334155',
    quote: 'I dictate invoices between client calls, Zenzex is the first tool that actually keeps up.',
  },
  {
    id: 'jordan',
    name: 'Jordan Okonkwo',
    role: 'Creative studio lead',
    avatarUrl: 'https://ui-avatars.com/api/?name=Jordan+Okonkwo&background=e2e8f0&color=334155',
    quote: 'Our three-person studio finally stopped chasing payments, reminders just happen.',
  },
  {
    id: 'sam',
    name: 'Sam Rivera',
    role: 'Independent consultant',
    avatarUrl: 'https://ui-avatars.com/api/?name=Sam+Rivera&background=e2e8f0&color=334155',
    quote: "Screenshot a scope email, get an invoice, it's stupidly fast for IT contracts.",
  },
];
