import { integerToFrench, madInWords } from './amount-in-words';

describe('integerToFrench', () => {
  it.each<[number, string]>([
    [0, 'zéro'],
    [1, 'un'],
    [16, 'seize'],
    [21, 'vingt et un'],
    [42, 'quarante-deux'],
    [70, 'soixante-dix'],
    [71, 'soixante et onze'],
    [77, 'soixante-dix-sept'],
    [80, 'quatre-vingts'],
    [81, 'quatre-vingt-un'],
    [91, 'quatre-vingt-onze'],
    [100, 'cent'],
    [101, 'cent un'],
    [200, 'deux cents'],
    [201, 'deux cent un'],
    [1000, 'mille'],
    [1001, 'mille un'],
    [2000, 'deux mille'],
    [80000, 'quatre-vingt mille'],
    [200000, 'deux cent mille'],
    [1_234_567, 'un million deux cent trente-quatre mille cinq cent soixante-sept'],
    [3_000_000, 'trois millions'],
  ])('%i -> %s', (n, words) => expect(integerToFrench(n)).toBe(words));
});

describe('madInWords', () => {
  it('writes dirhams and centimes', () => {
    expect(madInWords(123450)).toBe('mille deux cent trente-quatre dirhams et cinquante centimes');
  });
  it('handles singulars and round amounts', () => {
    expect(madInWords(100)).toBe('un dirham');
    expect(madInWords(351000)).toBe('trois mille cinq cent dix dirhams');
    expect(madInWords(101)).toBe('un dirham et un centime');
  });
});
