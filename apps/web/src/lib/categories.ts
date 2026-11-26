import type { ExpenseCategory } from '@ncc/contracts';

/** How each category looks. Order follows EXPENSE_CATEGORIES. */
export const CATEGORY: Record<ExpenseCategory, { label: string; emoji: string; tint: string }> = {
  food: { label: 'Food & drinks', emoji: '🍜', tint: 'bg-[#FFE4CC]' },
  transport: { label: 'Transport', emoji: '🚕', tint: 'bg-[#DDE9FF]' },
  accommodation: { label: 'Stay', emoji: '🏨', tint: 'bg-[#EDE3FF]' },
  activities: { label: 'Activities', emoji: '🎟️', tint: 'bg-[#D7F5E3]' },
  shopping: { label: 'Shopping', emoji: '🛍️', tint: 'bg-[#FFE0EC]' },
  groceries: { label: 'Groceries', emoji: '🛒', tint: 'bg-[#E3F4D7]' },
  fees: { label: 'Fees & bills', emoji: '🧾', tint: 'bg-[#E8EEF2]' },
  loan: { label: 'Cash / loan', emoji: '💵', tint: 'bg-[#DFF3EE]' },
  other: { label: 'Other', emoji: '📦', tint: 'bg-sun-300/40' },
};
