import { describe, expect, it } from 'vitest';
import { EXPENSE_CATEGORIES, isExpenseCategory, suggestCategory } from '../categories.ts';

describe('suggestCategory', () => {
  it.each([
    ['Dinner at Jimbaran', 'food'],
    ['Seafood dinner', 'food'],
    ['Grab to airport', 'transport'],
    ['Flights SIN-CAN', 'transport'],
    ['Airbnb 3 nights', 'accommodation'],
    ['Hotel breakfast', 'accommodation'],
    ['Dinner at the hotel', 'food'],
    ['Universal Studios tickets', 'activities'],
    ['Foot massage', 'activities'],
    ['Souvenirs', 'shopping'],
    ['7-Eleven snacks', 'groceries'],
    ['NTUC run', 'groceries'],
    ['eSIM', 'fees'],
    ['Lent Bob cash', 'loan'],
    ['晚餐', 'food'],
    ['打车去机场', 'transport'],
    ['桂林酒店', 'accommodation'],
    // Test report run 3, F9
    ['Water park tickets', 'activities'],
    ['Night market dinner', 'food'],
    ['Tea ceremony tickets', 'activities'],
    ['Grab food delivery', 'food'],
    ['Room service dinner', 'food'],
    ['Airport transfer', 'transport'],
    ['Pho', 'food'],
    ['Banh mi.', 'food'],
    ['Izakaya night', 'food'],
    ['Durian', 'food'],
    ['Ice cream', 'food'],
    ['Onsen', 'activities'],
    ['夜市', 'food'],
    ['Suica top-up', 'transport'],
    ['Booking.com', 'accommodation'],
  ])('%s → %s', (text, cat) => expect(suggestCategory(text)).toBe(cat));

  it('returns null when nothing matches or the text is empty', () => {
    expect(suggestCategory('Misc')).toBeNull();
    expect(suggestCategory('   ')).toBeNull();
    expect(suggestCategory('Carpark')).toBeNull(); // whole words only
    expect(suggestCategory('Bank transfer to Hal')).toBeNull(); // "transfer" alone isn't transport (F9)
  });

  it('knows its own categories', () => {
    expect(EXPENSE_CATEGORIES).toContain('other');
    expect(isExpenseCategory('food')).toBe(true);
    expect(isExpenseCategory('Food')).toBe(false);
    expect(isExpenseCategory(3)).toBe(false);
  });
});
