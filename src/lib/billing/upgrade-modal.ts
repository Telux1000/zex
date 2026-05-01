import { formatPlanMonthlyPrice, type BillingPlan } from '@/lib/billing/plans';

export type UpgradeTrigger =
  | 'ai_feature'
  | 'automation'
  | 'limit_reached'
  | 'voice_screenshot'
  | 'advanced_insights'
  | 'multi_currency'
  | 'teams';

export type UpgradeModalContent = {
  title: string;
  description: string;
  planName: 'Growth' | 'Professional' | 'Enterprise';
  priceText: string;
  benefits: string[];
};

const growthPrice = () => `${formatPlanMonthlyPrice('growth' as BillingPlan)}/month`;
const professionalPrice = () => `${formatPlanMonthlyPrice('professional' as BillingPlan)}/month`;
const enterprisePrice = () => `${formatPlanMonthlyPrice('enterprise' as BillingPlan)}/month`;

export function mapApiCodeToUpgradeTrigger(code: string | null | undefined): UpgradeTrigger | null {
  if (!code) return null;
  if (code === 'plan_limit_invoice_count') return 'limit_reached';
  if (code === 'plan_feature_automation') return 'automation';
  if (code === 'plan_feature_ai_assistant') return 'ai_feature';
  if (code === 'plan_feature_voice_screenshot') return 'voice_screenshot';
  if (code === 'plan_feature_advanced_insights') return 'advanced_insights';
  if (code === 'plan_feature_multi_currency') return 'multi_currency';
  if (code === 'plan_feature_teams') return 'teams';
  return null;
}

export function getUpgradeModalContent(trigger: UpgradeTrigger): UpgradeModalContent {
  if (trigger === 'automation') {
    return {
      title: 'Automate your invoicing workflow',
      description: 'Save hours each month with reminders, scheduled delivery, and payment nudges built in.',
      planName: 'Growth',
      priceText: growthPrice(),
      benefits: [
        'Automated reminders',
        'Scheduled invoice delivery',
        'Unlimited invoices',
        'Real-time payment tracking',
      ],
    };
  }

  if (trigger === 'limit_reached') {
    return {
      title: "You've reached your limit",
      description: 'You have reached your Starter invoice limit for this month. Upgrade to keep sending.',
      planName: 'Growth',
      priceText: growthPrice(),
      benefits: [
        'Unlimited invoices on Growth and above',
        'Automated reminders and AI creation',
        'Scalable billing for steady revenue',
      ],
    };
  }

  if (trigger === 'multi_currency') {
    return {
      title: 'Invoice in multiple currencies',
      description: 'Bill international clients in their currency and keep FX and reporting in sync.',
      planName: 'Professional',
      priceText: professionalPrice(),
      benefits: [
        'Multi-currency invoicing and reporting',
        'Advanced revenue insights',
        'Everything in Growth',
        'Priority support',
      ],
    };
  }

  if (trigger === 'advanced_insights') {
    return {
      title: 'Deeper business insights',
      description: 'Unlock forecasting, trend views, and revenue analysis beyond the basics.',
      planName: 'Professional',
      priceText: professionalPrice(),
      benefits: [
        'Advanced revenue insights and forecasting',
        'Multi-currency and FX context',
        'Full automation from Growth',
        'Priority support',
      ],
    };
  }

  if (trigger === 'teams') {
    return {
      title: 'Add your team to this workspace',
      description: 'Invite people in defined roles, manage access, and scale operations—without sharing one login.',
      planName: 'Enterprise',
      priceText: enterprisePrice(),
      benefits: [
        'Team roles and access controls',
        'API access for custom workflows',
        'Everything in Professional',
        'Dedicated onboarding and higher limits',
      ],
    };
  }

  return {
    title: 'Unlock AI-powered invoicing',
    description: 'Draft faster with AI-assisted creation from text, voice, or files.',
    planName: 'Growth',
    priceText: growthPrice(),
    benefits: [
      'AI assistant and smart invoice flow',
      'Voice and upload-based creation',
      'Unlimited invoices',
      'Reminders and automated delivery',
    ],
  };
}
