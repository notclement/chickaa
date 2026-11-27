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
 * Keywords that suggest a category from the description (English, a little Malay/Singlish, SEA and
 * Japanese food words, and Chinese). Matched as whole words for Latin text, as substrings for CJK.
 *
 * Which keyword wins (test report run 3, F9):
 * 1. A strong match beats an ordinary one: a multi-word phrase ("night market", "room service",
 *    "grab food", "water park") or a ticket word ("tickets", "admission"), so "Water park tickets"
 *    is an activity and "Night market dinner" is food.
 * 2. Otherwise the keyword that appears earliest wins ("Dinner at the hotel" → food,
 *    "Hotel breakfast" → stay); on a tie, the category listed first wins.
 */
const KEYWORDS: [ExpenseCategory, string[]][] = [
  ['loan', ['loan', 'lend', 'lent', 'borrow', 'borrowed', 'cash advance', 'iou', 'pay back', 'payback', 'repay', '借', '还钱']],
  ['food', ['room service', 'night market', 'grab food', 'grabfood', 'food delivery', 'foodpanda', 'deliveroo', 'uber eats', 'ubereats', 'food court', 'hawker centre', 'hawker center', '夜市']],
  ['activities', ['water park', 'theme park', 'tea ceremony', 'cable car', 'boat tour', 'island hopping', 'hot spring', 'hot springs', 'universal studios', 'disneyland']],
  ['transport', ['airport transfer', 'hotel transfer', 'car park', 'ic card']],
  ['accommodation', ['hotel', 'hostel', 'airbnb', 'resort', 'villa', 'motel', 'lodge', 'stay', 'room', 'rooms', 'accommodation', 'agoda', 'booking.com', 'check-in', 'checkin', 'homestay', 'ryokan', 'capsule', '酒店', '住宿', '民宿']],
  ['transport', ['grab', 'gojek', 'taxi', 'cab', 'uber', 'didi', 'bus', 'mrt', 'lrt', 'bts', 'ktm', 'train', 'flight', 'flights', 'airfare', 'airport', 'ferry', 'petrol', 'gas', 'fuel', 'parking', 'toll', 'tolls', 'car rental', 'car', 'scooter', 'bike', 'metro', 'subway', 'shuttle', 'tuk tuk', 'tuktuk', 'ktx', 'shinkansen', 'jr pass', 'suica', 'pasmo', 'icoca', 'octopus', 'ez-link', 'ezlink', '打车', '机票', '高铁', '火车', '地铁', '油费', '停车']],
  ['groceries', ['groceries', 'grocery', 'supermarket', 'ntuc', 'fairprice', 'cold storage', 'giant', 'sheng siong', '7-eleven', '7-11', 'seven eleven', 'familymart', 'lawson', 'konbini', 'convenience', 'mart', 'water', 'snacks', '超市', '便利店']],
  ['food', ['dinner', 'lunch', 'breakfast', 'brunch', 'supper', 'meal', 'meals', 'food', 'restaurant', 'cafe', 'café', 'coffee', 'kopi', 'teh', 'tea', 'bubble tea', 'boba', 'drinks', 'drink', 'beer', 'bar', 'wine', 'dessert', 'bbq', 'seafood', 'hawker', 'zi char', 'makan', 'pizza', 'burger', 'mcdonalds', "mcdonald's", 'kfc', 'starbucks', 'buffet', 'steak', 'hotpot', 'hot pot', 'dim sum', 'bakery', 'cake', 'ice cream', 'gelato', 'durian', 'mango sticky rice', 'pho', 'banh mi', 'bun cha', 'pad thai', 'tom yum', 'mookata', 'laksa', 'satay', 'nasi lemak', 'nasi goreng', 'mee goreng', 'roti prata', 'prata', 'chicken rice', 'bak kut teh', 'char kway teow', 'kaya toast', 'ramen', 'udon', 'soba', 'sushi', 'sashimi', 'izakaya', 'yakitori', 'yakiniku', 'tempura', 'takoyaki', 'okonomiyaki', 'bento', 'gyudon', 'tonkatsu', 'omakase', 'kbbq', '饭', '餐', '吃', '火锅', '咖啡', '奶茶', '早餐', '午餐', '晚餐', '宵夜', '酒']],
  ['activities', ['ticket', 'tickets', 'tour', 'tours', 'museum', 'park', 'zoo', 'aquarium', 'show', 'concert', 'spa', 'massage', 'dive', 'diving', 'snorkel', 'snorkeling', 'surf', 'hike', 'climb', 'karaoke', 'ktv', 'cinema', 'movie', 'klook', 'kkday', 'entrance', 'entry', 'admission', 'activity', 'activities', 'cruise', 'golf', 'ski', 'onsen', 'temple', 'shrine', 'safari', '门票', '按摩', '景点', '唱歌', '温泉']],
  ['shopping', ['shopping', 'souvenir', 'souvenirs', 'gift', 'gifts', 'clothes', 'shoes', 'mall', 'duty free', 'uniqlo', 'don quijote', 'donki', 'market', '购物', '纪念品', '礼物']],
  ['fees', ['visa', 'sim', 'esim', 'data', 'insurance', 'fee', 'fees', 'tax', 'tip', 'tips', 'service charge', 'deposit', 'atm', 'laundry', 'wifi', '签证', '保险', '小费', '手续费']],
];

/** Single words that are as telling as a phrase: a ticket is an activity whatever else is in the name. */
const STRONG = new Set(['ticket', 'tickets', 'admission', 'entrance', 'entry', '夜市']);

const CJK = /[぀-ヿ㐀-鿿]/;

/** Best-guess category for a description, or null if nothing matches. */
export function suggestCategory(description: string): ExpenseCategory | null {
  const text = description.toLowerCase().normalize('NFKC');
  if (!text.trim()) return null;
  // Words: letters/digits plus a few joiners, so "7-eleven" and "booking.com" stay whole.
  const padded = ` ${text.replace(/[^\p{L}\p{N}.'&+-]+/gu, ' ').replace(/[.'-]+(?= |$)/g, '')} `;
  let best: { strong: boolean; at: number; category: ExpenseCategory } | null = null;
  for (const [category, words] of KEYWORDS) {
    for (const w of words) {
      const at = CJK.test(w) ? text.indexOf(w) : padded.indexOf(` ${w} `);
      if (at < 0) continue;
      const strong = w.includes(' ') || STRONG.has(w);
      if (!best || (strong && !best.strong) || (strong === best.strong && at < best.at)) best = { strong, at, category };
    }
  }
  return best?.category ?? null;
}
