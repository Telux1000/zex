export type UpgradeTrigger =
  | 'ai_feature'
  | 'automation'
  | 'limit_reached'
  | 'voice_screenshot'
  | 'advanced_insights'
  | 'multi_currency';

export type UpgradeModalContent = {
  title: string;
  description: string;
  planName: 'Growth' | 'Professional' | 'Enterprise';
  priceText: string;
  benefits: string[];
};

export function mapApiCodeToUpgradeTrigger(code: string | null | undefined): UpgradeTrigger | null {
  if (!code) return null;
  if (code === 'plan_limit_invoice_count') return 'limit_reached';
  if (code === 'plan_feature_automation') return 'automation';
  if (code === 'plan_feature_ai_assistant') return 'ai_feature';
  if (code === 'plan_feature_voice_screenshot') return 'voice_screenshot';
  if (code === 'plan_feature_advanced_insights') return 'advanced_insights';
  if (code === 'plan_feature_multi_currency') return 'multi_currency';
  return null;
}

export function getUpgradeModalContent(trigger: UpgradeTrigger): UpgradeModalContent {
  if (trigger === 'automation') {
    return {
      title: 'Automate your invoicing workflow',
      description: 'Save hours each month with reminders and scheduled sends built into your workflow.',
      planName: 'Growth',
      priceText: '$59/month',
      benefits: [
        'Auto payment reminders',
        'Schedule invoices ahead of time',
        'More room to send invoices',
        'Clear payment tracking',
      ],
    };
  }

  if (trigger === 'limit_reached') {
    return {
      title: "You've reached your limit",
      description: 'You have reached your Starter invoice limit for this month. Upgrade to keep sending.',
      planName: 'Growth',
      priceText: '$59/month',
      benefits: [
        'Unlimited invoices',
        'Automated reminders',
        'Scheduled sending',
        'Multi-currency support',
      ],
    };
  }

  return {
    title: 'Unlock AI-powered invoicing',
    description: 'Draft faster and reduce manual work with AI-assisted invoice creation.',
    planName: 'Professional',
    priceText: '$79/month',
    benefits: [
      'AI assistant (chat to invoice)',
      'Voice & screenshot to invoice',
      'Advanced insights and reporting',
      'Priority support',
    ],
  };
}

