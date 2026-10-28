import { findMrzCandidates, parseMrzText, yymmddToIso } from './mrz';

const TODAY = new Date('2026-10-28T12:00:00Z');

// Specimen German passport MRZ (public sample data).
const GERMAN = ['P<D<<MUSTERMANN<<ERIKA<<<<<<<<<<<<<<<<<<<<<<', 'C01X00T478D<<6408125F2702283<<<<<<<<<<<<<<<4'];

describe('parseMrzText', () => {
  it('reads a valid TD3 passport and maps ICAO "D" to DEU', () => {
    const r = parseMrzText(GERMAN.join('\n'), TODAY);
    expect(r).toMatchObject({
      valid: true,
      format: 'TD3',
      fields: {
        firstName: 'Erika',
        lastName: 'Mustermann',
        sex: 'F',
        nationality: 'DEU',
        birthDate: '1964-08-12',
        documentType: 'PASSPORT',
        documentNumber: 'C01X00T47',
        documentExpiry: '2027-02-28',
      },
    });
  });

  it('finds the MRZ inside noisy OCR output (other text, spaces, lowercase, « for <)', () => {
    const noisy = [
      'BUNDESREPUBLIK DEUTSCHLAND',
      'Reisepass / Passport',
      'p<d<<mustermann<<erika<<<<<<<<<<<<<<<<<<<<<<',
      'C01X00T478D << 6408125F2702283«<<<<<<<<<<<<<<4',
      '',
    ].join('\n');
    const r = parseMrzText(noisy, TODAY);
    expect(r?.valid).toBe(true);
    expect(r?.fields.lastName).toBe('Mustermann');
  });

  it('still returns fields when check digits fail, flagged invalid', () => {
    const r = parseMrzText(
      'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<\nL898902C36UTO7408122F1204159ZE184226B<<<<<10',
      TODAY,
    );
    expect(r?.valid).toBe(false);
    expect(r?.fields).toMatchObject({
      firstName: 'Anna Maria',
      lastName: 'Eriksson',
      nationality: 'UTO',
      birthDate: '1974-08-12',
    });
  });

  it('reads a TD1 identity card', () => {
    const r = parseMrzText(
      'I<UTOD231458907<<<<<<<<<<<<<<<\n7408122F1204159UTO<<<<<<<<<<<6\nERIKSSON<<ANNA<MARIA<<<<<<<<<<',
      TODAY,
    );
    expect(r?.format).toBe('TD1');
    expect(r?.fields).toMatchObject({ documentType: 'ID_CARD', documentNumber: 'D23145890', lastName: 'Eriksson' });
  });

  // Real Tesseract (eng) outputs captured from a rendered specimen passport.
  it.each([
    ['P<D<<MUSTERMANN<K<ERIKAKKLLLLLLLLLLLLLLLLLLLKL\nC01X00T478D<<6408125F2702283<<<<<4'],
    ['P<D<<MUSTERMANN<<ERIKA<KKLLLLLLLLLLLLLLLLLLLKL\nCO01X00T478D<<6408125F2702283<<<<<'],
    ['P<D<<MUSTERMANN<K<KERIKAKKLLLLLLLLLLLLLLLLLLLL\nCO01X00T478D<<6408125F2702283<K<4'],
  ])('recovers the key fields from noisy Tesseract output %#', (ocr) => {
    const r = parseMrzText(ocr, TODAY);
    expect(r?.fields).toMatchObject({
      lastName: 'Mustermann',
      nationality: 'DEU',
      birthDate: '1964-08-12',
      documentNumber: 'C01X00T47',
      documentExpiry: '2027-02-28',
      sex: 'F',
    });
  });

  it('repairs a filler read as K right after the issuing state', () => {
    const r = parseMrzText(
      'P<D<K<MUSTERMANN<<ERTKA<<<<<<<<<<<<<<<<<<<<<<\nC01X00T478D<<6408125F2702283<<<<<<<<<<<<<<<4',
      TODAY,
    );
    expect(r?.valid).toBe(true);
    expect(r?.fields.lastName).toBe('Mustermann');
  });

  it('keeps names that end in L or K', () => {
    const r = parseMrzText(
      'P<FRADUPONT<<PAUL<<<<<<<<<<<<<<<<<<<<<<<<<<<\n12AB345678FRA8001017M3001018<<<<<<<<<<<<<<02',
      TODAY,
    );
    expect(r?.fields.firstName).toBe('Paul');
  });

  it('returns null when there is no MRZ', () => {
    expect(parseMrzText('Hello\nThis is a menu\n', TODAY)).toBeNull();
    expect(findMrzCandidates('')).toEqual([]);
  });
});

describe('yymmddToIso', () => {
  it('puts future-looking birth years in the 1900s', () => {
    expect(yymmddToIso('640812', 'past', TODAY)).toBe('1964-08-12');
    expect(yymmddToIso('050101', 'past', TODAY)).toBe('2005-01-01');
  });
  it('puts expiry dates in the 2000s', () => expect(yymmddToIso('310530', 'future', TODAY)).toBe('2031-05-30'));
  it('rejects impossible dates', () => {
    expect(yymmddToIso('641332', 'past', TODAY)).toBeUndefined();
    expect(yymmddToIso('ABCDEF', 'past', TODAY)).toBeUndefined();
  });
});
