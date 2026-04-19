/** Tunable thresholds for financial insights (base-currency comparisons). */
export const INSIGHT_THRESHOLDS = {
  highCategoryShareWarning: 0.5,
  highCategoryShareInfo: 0.4,
  meaningfulPercentChange: 0.25,
  expenseVsCollectionWarningRatio: 1.05,
  expenseVsRevenueWarningRatio: 1.02,
  cashCrisisCollectionRatio: 0.65,
  cashCrisisOutstandingVsExpenses: 0.85,
  collectionsPressureOutstandingVsCollected: 1.25,
  weekdayPatternMinExpenses: 8,
  weeklyChangeWarningPercent: 0.2,
  highExpenseActivityAmount: 2500,
} as const;
