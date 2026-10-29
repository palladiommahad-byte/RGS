import { payrollExpenseData } from './payroll-expense';

describe('payrollExpenseData', () => {
  const entry = { id: 'entry-1', riadId: 'riad-1', month: new Date('2026-10-01T00:00:00Z'), netPaid: 278000 };

  it('creates a Salaries expense for the net amount, linked to the entry', () => {
    expect(payrollExpenseData(entry, 'cat-salaries', '2026-10-31', 'TRANSFER', 'user-1')).toEqual({
      riadId: 'riad-1',
      categoryId: 'cat-salaries',
      amountTtc: 278000,
      tvaAmount: 0,
      date: new Date('2026-10-31T00:00:00Z'),
      paymentMethod: 'TRANSFER',
      note: 'Salaire 2026-10',
      payrollEntryId: 'entry-1',
      createdBy: 'user-1',
    });
  });

  it('creates nothing when nothing is paid', () => {
    expect(payrollExpenseData({ ...entry, netPaid: 0 }, 'cat', '2026-10-31', 'CASH', 'u')).toBeNull();
  });
});
