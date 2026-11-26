/** Expense categories, in the order they're shown. */
export const EXPENSE_CATEGORIES = [
  'food',
  'transport',
  'accommodation',
  'activities',
  'shopping',
  'groceries',
  'fees',
  'loan',
  'other',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export function isExpenseCategory(v: unknown): v is ExpenseCategory {
  return typeof v === 'string' && (EXPENSE_CATEGORIES as readonly string[]).includes(v);
}

/**
 * Keywords that suggest a category from the description (English, a little Malay/Singlish and Chinese).
 * Matched as whole words for Latin text, as substrings for CJK. The keyword that appears earliest
 * in the description wins ("Dinner at the hotel" → food, "Hotel breakfast" → accommodation);
 * on a tie, the category listed first wins.
 */
const KEYWORDS: [ExpenseCategory, string[]][] = [
  ['loan', ['loan', 'lend', 'lent', 'borrow', 'borrowed', 'cash advance', 'iou', 'pay back', 'payback', 'repay', '借', '还钱']],
  ['accommodation', ['hotel', 'hostel', 'airbnb', 'resort', 'villa', 'motel', 'lodge', 'stay', 'room', 'rooms', 'accommodation', 'agoda', 'booking.com', 'check-in', 'checkin', 'homestay', 'ryokan', '酒店', '住宿', '民宿']],
  ['transport', ['grab', 'gojek', 'taxi', 'cab', 'uber', 'didi', 'bus', 'mrt', 'train', 'flight', 'flights', 'airfare', 'ferry', 'petrol', 'gas', 'fuel', 'parking', 'toll', 'tolls', 'car rental', 'car', 'scooter', 'bike', 'metro', 'subway', 'shuttle', 'transfer', 'tuk tuk', 'ktx', 'shinkansen', 'jr pass', '打车', '机票', '高铁', '火车', '地铁', '油费', '停车']],
  ['groceries', ['groceries', 'grocery', 'supermarket', 'ntuc', 'fairprice', 'cold storage', 'giant', 'sheng siong', '7-eleven', '7-11', 'seven eleven', 'familymart', 'lawson', 'convenience', 'mart', 'water', 'snacks', '超市', '便利店']],
  ['food', ['dinner', 'lunch', 'breakfast', 'brunch', 'supper', 'meal', 'meals', 'food', 'restaurant', 'cafe', 'café', 'coffee', 'kopi', 'teh', 'tea', 'bubble tea', 'boba', 'drinks', 'drink', 'beer', 'bar', 'wine', 'dessert', 'bbq', 'seafood', 'ramen', 'sushi', 'hawker', 'zi char', 'makan', 'pizza', 'burger', 'mcdonalds', "mcdonald's", 'kfc', 'starbucks', 'buffet', 'steak', 'hotpot', 'dim sum', '饭', '餐', '吃', '火锅', '咖啡', '奶茶', '早餐', '午餐', '晚餐', '宵夜', '酒']],
  ['activities', ['ticket', 'tickets', 'tour', 'tours', 'museum', 'park', 'theme park', 'zoo', 'aquarium', 'show', 'concert', 'spa', 'massage', 'dive', 'diving', 'snorkel', 'snorkeling', 'surf', 'hike', 'climb', 'karaoke', 'ktv', 'cinema', 'movie', 'klook', 'kkday', 'entrance', 'admission', 'activity', 'activities', 'cruise', 'golf', 'ski', '门票', '按摩', '景点', '唱歌']],
  ['shopping', ['shopping', 'souvenir', 'souvenirs', 'gift', 'gifts', 'clothes', 'shoes', 'mall', 'duty free', 'uniqlo', 'market', '购物', '纪念品', '礼物']],
  ['fees', ['visa', 'sim', 'esim', 'data', 'insurance', 'fee', 'fees', 'tax', 'tip', 'tips', 'service charge', 'deposit', 'atm', 'laundry', 'wifi', '签证', '保险', '小费', '手续费']],
];

const CJK = /[぀-ヿ㐀-鿿]/;

/** Best-guess category for a description, or null if nothing matches. */
export function suggestCategory(description: string): ExpenseCategory | null {
  const text = description.toLowerCase().normalize('NFKC');
  if (!text.trim()) return null;
  // Words: letters/digits plus a few joiners, so "7-eleven" and "booking.com" stay whole.
  const padded = ` ${text.replace(/[^\p{L}\p{N}.'&+-]+/gu, ' ')} `;
  let best: { at: number; category: ExpenseCategory } | null = null;
  for (const [category, words] of KEYWORDS) {
    for (const w of words) {
      const at = CJK.test(w) ? text.indexOf(w) : padded.indexOf(` ${w} `);
      if (at >= 0 && (!best || at < best.at)) best = { at, category };
    }
  }
  return best?.category ?? null;
}
