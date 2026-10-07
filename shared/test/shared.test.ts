import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS, PRINT_COLUMNS, buildEstimateEscPosText, buildTestPrintEscPos, calcEstimate, calcItem,
  assignOrderId, orderIdOf, newEstimate, newItem, pricingFromSettings, renderEstimateHtml, renderReceiptHtml, sampleEstimate, toMonochrome,
  searchStock, searchCash, boughtPurity, submittedRate, netMetalWeight, submittedWeight, silverPaymentValue, goldPaymentValue, paidTotal, balanceLeft, validatePayment, withPayment, mergeBills, mergeById, fixBillNumbers, stockMatchesForSale, saleOutEntry, fineWeight, buildPdfFromJpegs, A4_PT, searchEstimates, matchesQuery, makingCharge, normalizeMaking, switchMakingMode, cashTotals, sortCash, validateCashEntry, round, stockByItem, stockTotals, sortStock, validateStockEntry, today, toFixedMaking, validateEstimate, type EstimateItem,
} from '../src';

const pricing = { ...pricingFromSettings(DEFAULT_SETTINGS), silverRate: 100000, silverRateUnit: 'per_kg' as const, goldRate: 100000, goldRateUnit: 'per_10g' as const, roundGrandTotal: false };
const item = (o: Partial<EstimateItem>): EstimateItem => ({ ...newItem(DEFAULT_SETTINGS), ...o });

describe('calculations', () => {
  it('net weight = gross - less, never negative', () => {
    expect(calcItem(item({ grossWt: 10.5, lessWt: 0.25 }), pricing).netWt).toBe(10.25);
    expect(calcItem(item({ grossWt: 1, lessWt: 2 }), pricing).netWt).toBe(0);
  });
  it('pure metal weight is Net x Tunch only; old wastage values are ignored', () => {
    const it1 = item({ grossWt: 100, lessWt: 0, tunch: 80, wastage: 5 });
    expect(calcItem(it1, pricing).fineWt).toBe(80);
    expect(calcItem({ ...it1, wastage: 0 }, pricing).fineWt).toBe(80);
  });
  it('amount = fine × rate per gram + labour, per metal and rate unit', () => {
    // silver 100000/kg = 100/g; fine 80 g → 8000; making 15/g × 100 = 1500
    const s = calcItem(item({ metal: 'silver', grossWt: 100, tunch: 80, labourRate: 15, labourMode: 'per_gram' }), pricing);
    expect(s.amount).toBe(9500);
    // gold 100000/10g = 10000/g; net 2, fine 2 × 91.6% = 1.832 → 18320; making 500 × 2 pcs = 1000
    const g = calcItem(item({ metal: 'gold', grossWt: 2, tunch: 91.6, pcs: 2, labourRate: 500, labourMode: 'per_piece' }), pricing);
    expect(g.fineWt).toBe(1.832);
    expect(g.amount).toBe(18320 + 1000);
    expect(calcItem(item({ labourRate: 250, labourMode: 'fixed', grossWt: 1 }), pricing).labour).toBe(250);
  });
  it('making charge is one total; old per-gram / per-piece items convert to the same total', () => {
    const old = item({ grossWt: 10, lessWt: 0, pcs: 3, labourRate: 500, labourMode: 'per_gram' });
    const fixed = toFixedMaking(old);
    expect(fixed.labourMode).toBe('fixed');
    expect(fixed.labourRate).toBe(5000);
    expect(calcItem(fixed, pricing).labour).toBe(calcItem(old, pricing).labour);
    expect(toFixedMaking(item({ labourRate: 250, labourMode: 'fixed' })).labourRate).toBe(250);
    expect(toFixedMaking({ ...old, labourMode: 'per_piece', labourRate: 100 }).labourRate).toBe(300);
    expect(newItem(DEFAULT_SETTINGS).labourMode).toBe('fixed');
  });
  it('Gold: making charge is a % of the gold value; Silver: rupees typed directly', () => {
    // gold 7200/g (per 10 g 72000), net 10 g, tunch 91.6 -> 9.16 g of gold = 65,952; 5 % = 3,297.60
    const gold = item({ metal: 'gold', grossWt: 10, tunch: 91.6, labourRate: 5, labourMode: 'percent' });
    const gp = { ...pricing, goldRate: 7200, goldRateUnit: 'per_gram' as const };
    expect(makingCharge(gold, gp)).toBe(3297.6);
    expect(calcItem(gold, gp).amount).toBe(69250); // 65,952 + 3,297.60 rounded to the rupee
    // silver: the number is the rupees
    const silver = item({ metal: 'silver', grossWt: 100, tunch: 80, labourRate: 900, labourMode: 'fixed' });
    expect(makingCharge(silver, pricing)).toBe(900);
    expect(calcItem(silver, pricing).amount).toBe(8000 + 900);
    // 0 % means no making charge
    expect(makingCharge({ ...gold, labourRate: 0 }, gp)).toBe(0);
    // a new item starts with nothing filled in; Gold starts as percent, Silver as rupees
    expect(newItem(DEFAULT_SETTINGS, 'gold')).toMatchObject({ labourRate: 0, labourMode: 'percent' });
    expect(newItem(DEFAULT_SETTINGS, 'silver')).toMatchObject({ labourRate: 0, labourMode: 'fixed' });
  });
  it('older per-gram / per-piece items keep the same making charge in rupees when loaded; % and rupee items stay as entered', () => {
    const gp = { ...pricing, goldRate: 7200, goldRateUnit: 'per_gram' as const };
    const perPiece = normalizeMaking(item({ metal: 'gold', grossWt: 10, pcs: 3, labourRate: 100, labourMode: 'per_piece', tunch: 91.6 }), gp);
    expect(perPiece.labourMode).toBe('fixed');
    expect(perPiece.labourRate).toBe(300);
    const perGram = normalizeMaking(item({ metal: 'silver', grossWt: 10, labourRate: 15, labourMode: 'per_gram' }), pricing);
    expect(perGram).toMatchObject({ labourMode: 'fixed', labourRate: 150 });
    expect(normalizeMaking(item({ metal: 'gold', labourRate: 2500, labourMode: 'fixed' }), gp)).toMatchObject({ labourMode: 'fixed', labourRate: 2500 });
    expect(normalizeMaking(item({ metal: 'silver', labourRate: 10, labourMode: 'percent' }), pricing)).toMatchObject({ labourMode: 'percent', labourRate: 10 });
  });
  it('switching % <-> rupees (either metal) keeps the same making charge', () => {
    const gp = { ...pricing, goldRate: 7200, goldRateUnit: 'per_gram' as const };
    // Gold 10 g @ 92.5 % = 9.25 g = 66,600; 5 % = 3,330
    const gold = item({ metal: 'gold', grossWt: 10, tunch: 92.5, labourRate: 5, labourMode: 'percent' });
    const asRupees = switchMakingMode(gold, gp, 'fixed');
    expect(asRupees).toMatchObject({ labourMode: 'fixed', labourRate: 3330 });
    expect(calcItem(asRupees, gp).amount).toBe(calcItem(gold, gp).amount);
    const back = switchMakingMode(asRupees, gp, 'percent');
    expect(back.labourMode).toBe('percent');
    expect(back.labourRate).toBeCloseTo(5, 3);
    // Silver 100 g @ 80 % = 80 g; silver rate 100/g = 8,000; Rs 900 = 11.25 %
    const silver = item({ metal: 'silver', grossWt: 100, tunch: 80, labourRate: 900, labourMode: 'fixed' });
    const asPct = switchMakingMode(silver, pricing, 'percent');
    expect(asPct.labourMode).toBe('percent');
    expect(asPct.labourRate).toBe(11.25);
    expect(makingCharge(asPct, pricing)).toBe(900);
    expect(calcItem(asPct, pricing).amount).toBe(calcItem(silver, pricing).amount);
    // percent of a metal value that is 0 (nothing entered yet) stays 0
    expect(switchMakingMode(item({ metal: 'gold', labourRate: 500, labourMode: 'fixed' }), gp, 'percent').labourRate).toBe(0);
    // same mode: unchanged number
    expect(switchMakingMode(gold, gp, 'percent').labourRate).toBe(5);
  });
  it('a Gold making charge above 100 % is refused', () => {
    const est = newEstimate(DEFAULT_SETTINGS);
    est.items = [item({ description: 'Ring', metal: 'gold', grossWt: 5, tunch: 91.6, labourRate: 150, labourMode: 'percent' })];
    expect(validateEstimate(est).map((i) => i.message).join()).toMatch(/cannot be more than 100/);
  });
  it('manual amount override wins', () => {
    expect(calcItem(item({ grossWt: 5, tunch: 90, amountOverride: 1234.5 }), pricing).amount).toBe(1235); // whole rupees
  });
  it('totals are whole rupees: items, other charges, GST; no round-off', () => {
    const est = { ...newEstimate(DEFAULT_SETTINGS), pricing: { ...pricing, gstEnabled: true, gstPercent: 3 } };
    est.items = [item({ grossWt: 100, tunch: 80, labourRate: 15 }), item({ grossWt: 10.333, lessWt: 0.111, tunch: 92.5, labourRate: 0 })];
    est.otherCharges = [{ id: 'h', label: 'Hallmark', amount: 45 }];
    const t = calcEstimate(est);
    expect(t.netWt).toBe(110.222);
    t.items.forEach((i) => expect(Number.isInteger(i.amount)).toBe(true));
    expect(t.subtotal).toBe(t.itemsAmount + 45);
    expect(t.gst).toBe(Math.round((t.subtotal * 3) / 100));
    expect(t.grandTotal).toBe(t.subtotal + t.gst);
    expect(Number.isInteger(t.grandTotal)).toBe(true);
    expect(t.roundOff).toBe(0);
  });
  it('validation catches empty and inconsistent rows', () => {
    const est = newEstimate(DEFAULT_SETTINGS);
    expect(validateEstimate(est).length).toBeGreaterThan(0);
    est.items = [item({ description: 'Ring', grossWt: 1, lessWt: 2 })];
    expect(validateEstimate(est).map((i) => i.message).join()).toMatch(/Less Wt\. is more than G\. Wt\./);
    est.items = [item({ description: 'Ring', grossWt: 3, lessWt: 1, tunch: 92.5 })];
    expect(validateEstimate(est)).toEqual([]);
  });
});

describe('print template', () => {
  const header = { shopName: 'S.P. JEWELLERS', shopCode: 'ELNABAAD (S0012)' };
  it('has exactly the ten columns, in order, and the shop header', () => {
    const html = renderEstimateHtml(sampleEstimate(DEFAULT_SETTINGS), header);
    const ths = [...html.matchAll(/<th>(.*?)<\/th>/g)].map((m) => m[1]);
    expect(ths).toEqual([...PRINT_COLUMNS]);
    expect(html).toContain('S.P. JEWELLERS');
    expect(html).toContain('ELNABAAD (S0012)'); // still printed when a second line is given
    // the bill now carries ESTIMATE, the bill number and the date (the shop's own layout)
    expect(html).toMatch(/ESTIMATE</);
    expect(html).toMatch(/Order ID/);
    expect(html).toMatch(/Date:/);
    expect(html).not.toContain('>Silver Rate<'); // the rates moved to the bottom-left corner
    expect(html).not.toContain('>Gold Rate<');
    expect(html).toContain('Silver: ₹2,310 / 10 g');
    expect(html).toContain('Gold: ₹72,000 / 10 g');
    expect(html).not.toMatch(/BHAV/i);
    expect(html).toContain('TOTAL');
    // the sample has 6 items, above the 5-row minimum (plus the column header row)
    expect((html.match(/<tr>/g) ?? []).length).toBe(6 + 1);
    expect(html).toContain('@page { size: A4 portrait; margin: 10mm; }');
  });
  it('item rows: 5 when there are fewer than 5 items, otherwise one row per item', () => {
    const rows = (n: number) => {
      const est = sampleEstimate(DEFAULT_SETTINGS);
      est.items = Array.from({ length: n }, (_, i) => ({ ...est.items[i % est.items.length], id: `i${i}` }));
      const html = renderEstimateHtml(est, header);
      // body rows before the summary rows = item rows (real + blank)
      const body = html.split('<tbody>')[1].split('class="sum')[0];
      return (body.match(/<tr>/g) ?? []).length;
    };
    expect(rows(0)).toBe(5);
    expect(rows(1)).toBe(5);
    expect(rows(4)).toBe(5);
    expect(rows(5)).toBe(5);
    expect(rows(6)).toBe(6);
    expect(rows(12)).toBe(12);
  });
  it('the bill has 8 columns: no Wstg, no Tunch, one Gold/Silver column, and the charge column is "Making"', () => {
    expect([...PRINT_COLUMNS]).toEqual(['Description', 'G. Wt.', 'Less Wt.', 'Net Wt.', 'Pcs', 'Making', 'Gold/Silver', 'Amount']);
    const html = renderEstimateHtml(sampleEstimate(DEFAULT_SETTINGS), header);
    expect(html).not.toContain('Wstg');
    expect(html).not.toContain('Labour');
    expect((html.match(/<th>/g) ?? []).length).toBe(8);
    expect(html).not.toContain('<th>Tunch</th>');
  });
  it('prints Pcs as a plain number (no pair marker), even for old data that carries a unit', () => {
    const est = sampleEstimate(DEFAULT_SETTINGS);
    est.items[0].pcs = 2;
    est.items[0].pcsUnit = 'pair';
    const html = renderEstimateHtml(est, header);
    expect(html).not.toMatch(/\d P</);
    expect(html).toContain('<td>2</td>');
  });
  it('prints only the shop name when there is no second line', () => {
    const html = renderEstimateHtml(sampleEstimate(DEFAULT_SETTINGS), { shopName: 'S.P. JEWELLERS', shopCode: '' });
    expect(DEFAULT_SETTINGS.shopCode).toBe('');
    expect(html).toContain('S.P. JEWELLERS');
    expect(html).not.toContain('ELNABAAD');
    expect(html).not.toContain('<div class="code">');
  });
  it('bill header: ESTIMATE on top, owner name + mobile right, logo left, shop name middle, address below', () => {
    const est = sampleEstimate(DEFAULT_SETTINGS);
    est.number = 7;
    est.customerName = 'Ramesh Kumar';
    est.customerPhone = '98765 43210';
    est.createdAt = new Date(2026, 9, 4, 12).toISOString();
    const html = renderEstimateHtml(est, { ...header, logo: true, ownerName: 'Sandeep Soni', ownerPhone: '94166 25950', address: 'Main Bazar, Near Gandhi Chowk, Ellenabad-125102' });
    const at = (t: string) => html.indexOf(t);
    expect(html).toContain('class="estimate-title">ESTIMATE<');
    expect(html).toContain('<b>Sandeep Soni</b><span>M.: 94166 25950</span>');
    expect(at('class="top-right"')).toBeGreaterThan(at('class="estimate-title"'));
    expect(at('class="brand-logo"><img')).toBeGreaterThan(-1);
    expect(at('class="brand-logo"')).toBeLessThan(at('class="shop"'));
    expect(at('class="shop"')).toBeLessThan(at('class="address"'));
    expect(html).toContain('Main Bazar, Near Gandhi Chowk, Ellenabad-125102');
    expect(at('class="estimate-title"')).toBeLessThan(at('class="brand"'));
    // the first row INSIDE the table: customer + mobile (7 columns), bill number + date (last 2 columns)
    expect(html).toContain('<span class="k">Customer:</span><b>Ramesh Kumar</b>');
    expect(html).toContain('<span class="k">Mobile:</span><b>98765 43210</b>');
    expect(html).toContain(`<span class="k">Order ID:</span><b>${orderIdOf({ number: 7 })}</b>`);
    expect(html).toContain('<span class="k">Date:</span><b>04 Oct 2026</b>');
    expect(html).toContain('<tr class="meta-row"><td colspan="6" class="meta-l">');
    expect(html).toContain('<td colspan="2" class="meta-r">');
    expect(at('<table>')).toBeLessThan(at('class="meta-row"'));
    expect(at('class="meta-row"')).toBeLessThan(at('<th>Description</th>'));
    expect(at('class="meta-l"')).toBeLessThan(at('class="meta-r"'));
    expect(at('class="meta-row"')).toBeGreaterThan(at('class="address"'));
    // 7 + 2 = the 9 printed columns, so the right cell starts exactly at the Gold/Silver column
    const row = html.slice(at('class="meta-row"'), at('<th>Description</th>'));
    expect((row.match(/colspan="(\d)"/g) ?? []).join('')).toBe('colspan="6"colspan="2"');
    // left-to-right order inside the brand row: logo, then name
    expect(html).toMatch(/grid-template-columns: 24mm 1fr 24mm/);
  });
  it('the customer row is always there (blank values) and an unsaved bill shows a dash for the number', () => {
    const est = sampleEstimate(DEFAULT_SETTINGS);
    est.customerName = est.customerPhone = '';
    const html = renderEstimateHtml(est, header);
    expect(html).toContain('<span class="k">Customer:</span><b></b>');
    expect(html).toContain('<span class="k">Mobile:</span><b></b>');
    expect(html).toContain('<span class="k">Order ID:</span><b>—</b>');
  });
  it('receipt layouts carry the same facts', () => {
    const est = sampleEstimate(DEFAULT_SETTINGS);
    est.number = 3; est.customerName = 'Ramesh'; est.customerPhone = '98765';
    const h = { ...header, ownerName: 'Sandeep Soni', ownerPhone: '94166 25950', address: 'Main Bazar' };
    const img = renderReceiptHtml(est, h, 576);
    for (const t of ['ESTIMATE', 'Sandeep Soni', 'M.: 94166 25950', 'Main Bazar', `Order ID: <b>${orderIdOf({ number: 3 })}</b>`, 'Customer: <b>Ramesh</b>', 'Mobile: <b>98765</b>']) expect(img).toContain(t);
    const text = Buffer.from(buildEstimateEscPosText(est, h, 80)).toString('latin1');
    for (const t of ['ESTIMATE', 'Sandeep Soni', 'Main Bazar', `Order ID: ${orderIdOf({ number: 3 })}`, 'Customer: Ramesh', 'Mobile: 98765']) expect(text).toContain(t);
  });
  it('Gold/Silver column names the metal on each row; both prices sit in two rows at the bottom left', () => {
    const mk = (metals: Array<'gold' | 'silver'>) => {
      const est = sampleEstimate(DEFAULT_SETTINGS);
      est.items = metals.map((metal, i) => ({ ...est.items[0], id: `m${i}`, metal }));
      return renderEstimateHtml(est, header);
    };
    const both = mk(['gold', 'silver', 'gold']);
    // the metal is written in each item row, in the combined column
    expect((both.match(/<td>Gold<\/td>/g) ?? []).length).toBe(2);
    expect((both.match(/<td>Silver<\/td>/g) ?? []).length).toBe(1);
    expect(both).toContain('<th>Gold/Silver</th>');
    expect(both).not.toMatch(/BHAV/i);
    // no rate rows inside the table any more; the footer has both prices, silver first, in two rows (even when only one metal was bought)
    expect(both).not.toContain('>Silver Rate<');
    for (const html of [both, mk(['gold']), mk(['silver', 'silver'])]) {
      expect(html).toContain('<div class="foot-rates"><div>Gold: ₹72,000 / 10 g</div><div>Silver: ₹2,310 / 10 g</div></div>');
    }
    // it comes after the table (bottom of the bill)
    expect(both.indexOf('class="foot-rates"')).toBeGreaterThan(both.indexOf('</table>'));
  });
  it('the bill ends with ONE total row: no SUBTOTAL, no GRAND TOTAL', () => {
    const est = sampleEstimate(DEFAULT_SETTINGS);
    est.pricing.gstEnabled = false;
    const html = renderEstimateHtml(est, header);
    expect((html.match(/>TOTAL</g) ?? []).length).toBe(1);
    expect(html).not.toContain('SUBTOTAL');
    expect(html).not.toContain('GRAND TOTAL');
    // the total is the last row and equals the calculated total
    const total = calcEstimate(est).grandTotal;
    expect(html.indexOf('>TOTAL<')).toBeGreaterThan(html.indexOf('<tbody>'));
    expect(html).toContain(`₹${new Intl.NumberFormat('en-IN').format(total)}`);
    // with GST on, its row stays (a tax line is never hidden) and is followed by the single TOTAL
    est.pricing.gstEnabled = true;
    const withGst = renderEstimateHtml(est, header);
    expect(withGst).toMatch(/GST 3%/);
    expect((withGst.match(/>TOTAL</g) ?? []).length).toBe(1);
    expect(withGst.indexOf('GST 3%')).toBeLessThan(withGst.indexOf('>TOTAL<'));
    // receipt layouts follow the same rule
    const receipt = renderReceiptHtml(est, header, 576);
    expect(receipt).not.toMatch(/SUBTOTAL|GRAND TOTAL/);
    expect(buildEstimateEscPosText(est, header, 80).toString()).toBeTruthy();
    expect(Buffer.from(buildEstimateEscPosText(est, header, 80)).toString('latin1')).not.toMatch(/SUBTOTAL|GRAND TOTAL/);
  });
  it('no ROUND OFF row and no paise anywhere on the bill', () => {
    const est = sampleEstimate(DEFAULT_SETTINGS);
    est.pricing.gstEnabled = true;
    const html = renderEstimateHtml(est, header);
    expect(html).not.toMatch(/ROUND OFF/i);
    expect(html).not.toMatch(/₹[0-9,]+[.][0-9]/);
  });
  it('escapes user text', () => {
    const est = sampleEstimate(DEFAULT_SETTINGS);
    est.items[0].description = '<script>x</script>';
    expect(renderEstimateHtml(est, header)).not.toContain('<script>x');
    expect(renderReceiptHtml(est, header, 576)).not.toContain('<script>x');
  });
});

describe('ESC/POS', () => {
  it('test print starts with init and ends with cut', () => {
    const b = buildTestPrintEscPos({ shopName: 'S.P. JEWELLERS', shopCode: 'ELNABAAD (S0012)' });
    expect([...b.slice(0, 2)]).toEqual([0x1b, 0x40]);
    expect([...b.slice(-4)]).toEqual([0x1d, 0x56, 0x42, 0x00]);
    expect(Buffer.from(b).toString('latin1')).toContain('Printer Test Successful');
  });
  it('text estimate is pure ASCII and fits paper width', () => {
    const b = buildEstimateEscPosText(sampleEstimate(DEFAULT_SETTINGS), { shopName: 'S.P. JEWELLERS', shopCode: 'ELNABAAD (S0012)' }, 58);
    const text = Buffer.from(b).toString('latin1');
    expect(text).toContain('Gold Ring - Classic');
    expect(text).toContain('Silver Rate');
    expect(text).not.toMatch(/BHAV/i);
    for (const ln of text.split('\n')) {
      const printable = ln.replace(/[\x00-\x1f]./g, '').replace(/[^\x20-\x7e]/g, '');
      expect(printable.length).toBeLessThanOrEqual(34);
    }
  });
  it('monochrome conversion packs MSB-first, black = 1', () => {
    const px = new Uint8Array(9 * 1 * 4).fill(255);
    px.set([0, 0, 0, 255], 0); // first pixel black
    px.set([0, 0, 0, 255], 8 * 4); // ninth pixel black
    const { bits, widthBytes } = toMonochrome(px, 9, 1, 'rgba');
    expect(widthBytes).toBe(2);
    expect([...bits]).toEqual([0x80, 0x80]);
  });
});


describe('shop stock register', () => {
  const e = (o: Partial<StockEntry>): StockEntry => ({ id: Math.random().toString(36), date: '2026-10-03', type: 'in', metal: 'gold', item: 'Gold bar', weight: 0, pcs: 0, note: '', createdAt: '2026-10-03T10:00:00Z', tunch: 91.6, ...o });
  const list = [
    e({ type: 'in', metal: 'gold', item: 'Gold bar', weight: 100.5, pcs: 1 }),
    e({ type: 'out', metal: 'gold', item: 'gold bar', weight: 30.25, pcs: 0 }),
    e({ type: 'in', metal: 'silver', item: 'Anklet', weight: 500, pcs: 10 }),
    e({ type: 'out', metal: 'silver', item: 'Anklet', weight: 120.125, pcs: 3 }),
    e({ type: 'in', metal: 'gold', item: 'Gold Ring – Classic', weight: 20, pcs: 4 }),
  ];
  it('totals per metal: in, out and what is left', () => {
    const g = stockTotals(list, 'gold');
    expect(g.inWt).toBe(120.5);
    expect(g.outWt).toBe(30.25);
    expect(g.netWt).toBe(90.25);
    expect(g.netPcs).toBe(5);
    const s = stockTotals(list, 'silver');
    expect(s.netWt).toBe(379.875);
    expect(s.netPcs).toBe(7);
    expect(stockTotals([], 'gold').netWt).toBe(0);
  });
  it('more out than in shows as a negative balance (so the owner can see the mistake)', () => {
    expect(stockTotals([e({ type: 'out', weight: 5 })], 'gold').netWt).toBe(-5);
  });
  it('stock by item groups same metal + name ignoring case, gold before silver', () => {
    const rows = stockByItem(list);
    expect(rows.map((r) => `${r.metal}:${r.item}`)).toEqual(['gold:Gold bar', 'gold:Gold Ring – Classic', 'silver:Anklet']);
    const bar = rows.find((r) => r.item.toLowerCase() === 'gold bar')!;
    expect(bar.netWt).toBe(70.25);
    expect(rows[rows.length - 1].metal).toBe('silver');
    expect(rows.filter((r) => r.metal === 'gold')).toHaveLength(2);
  });
  it('newest first by date, then by entry time', () => {
    const a = e({ id: 'a', date: '2026-10-01' }), b = e({ id: 'b', date: '2026-10-03', createdAt: '2026-10-03T09:00:00Z' }), c = e({ id: 'c', date: '2026-10-03', createdAt: '2026-10-03T11:00:00Z' });
    expect(sortStock([a, b, c]).map((x) => x.id)).toEqual(['c', 'b', 'a']);
  });
  it('validation: weight and date required, pieces whole', () => {
    expect(validateStockEntry(e({ weight: 0 }))).toMatch(/weight/i);
    expect(validateStockEntry(e({ weight: 5, date: '' }))).toMatch(/date/i);
    expect(validateStockEntry(e({ weight: 5, pcs: 1.5 }))).toMatch(/whole/i);
    expect(validateStockEntry(e({ weight: 5, item: '' }))).toMatch(/item/i);
    expect(validateStockEntry(e({ weight: 5, tunch: 120 }))).toMatch(/tunch/i);
    expect(validateStockEntry(e({ weight: 5, pcs: 2 }))).toBeNull();
    expect(today(new Date(2026, 9, 3))).toBe('2026-10-03');
  });
});


describe('cash register', () => {
  const c = (o: Partial<CashEntry>): CashEntry => ({ id: Math.random().toString(36), date: '2026-10-03', type: 'in', amount: 0, note: '', createdAt: '2026-10-03T10:00:00Z', ...o });
  it('balance is cash in minus cash out, in whole rupees', () => {
    const t = cashTotals([c({ type: 'in', amount: 50000 }), c({ type: 'out', amount: 12000.4 }), c({ type: 'in', amount: 2500 })]);
    expect(t.inAmt).toBe(52500);
    expect(t.outAmt).toBe(12000);
    expect(t.balance).toBe(40500);
    expect(cashTotals([]).balance).toBe(0);
    expect(cashTotals([c({ type: 'out', amount: 100 })]).balance).toBe(-100);
  });
  it('newest first, and validation', () => {
    const a = c({ id: 'a', date: '2026-10-01' }), b = c({ id: 'b', date: '2026-10-03' });
    expect(sortCash([a, b]).map((x) => x.id)).toEqual(['b', 'a']);
    expect(validateCashEntry(c({ amount: 0 }))).toMatch(/amount/i);
    expect(validateCashEntry(c({ amount: 10, date: '' }))).toMatch(/date/i);
    expect(validateCashEntry(c({ amount: 10 }))).toBeNull();
  });
});


describe('searching saved bills', () => {
  const mk = (number: number, o: Partial<ReturnType<typeof newEstimate>> & { when?: string; items?: EstimateItem[] }) => {
    const est = newEstimate(DEFAULT_SETTINGS);
    est.number = number;
    est.createdAt = est.updatedAt = o.when ?? new Date(2026, 9, 3, 14, 0).toISOString();
    est.customerName = o.customerName ?? '';
    est.customerPhone = o.customerPhone ?? '';
    est.customerLocality = o.customerLocality ?? '';
    est.items = o.items ?? [];
    return est;
  };
  const ring = (w: number, desc = 'Gold Ring – Classic') => ({ ...newItem(DEFAULT_SETTINGS, 'gold'), description: desc, metal: 'gold' as const, grossWt: w, lessWt: 0, tunch: 91.6, labourRate: 2, labourMode: 'percent' as const });
  const anklet = (w: number) => ({ ...newItem(DEFAULT_SETTINGS, 'silver'), description: 'Silver Anklet – Traditional', metal: 'silver' as const, grossWt: w, lessWt: 0, tunch: 92.5, labourRate: 900, labourMode: 'fixed' as const });
  const a = mk(1, { customerName: 'Ramesh Kumar', customerPhone: '98765 43210', customerLocality: 'Gandhi Chowk', items: [ring(10.5)], when: new Date(2026, 9, 3, 14).toISOString() });
  const b = mk(2, { customerName: 'Sunita Devi', customerPhone: '9416125950', customerLocality: 'Main Bazar', items: [anklet(38.5)], when: new Date(2026, 8, 15, 11).toISOString() });
  const c = mk(3, { customerName: 'Lovish', items: [ring(5), anklet(20)], when: new Date(2025, 11, 31, 9).toISOString() });
  const all = [a, b, c];
  const ids = (q: string) => searchEstimates(all, q).map((e) => e.number);

  it('finds by customer name (any part, any case)', () => {
    expect(ids('ramesh')).toEqual([1]);
    expect(ids('KUMAR')).toEqual([1]);
    expect(ids('sunita')).toEqual([2]);
  });
  it('finds by phone number, including part of it and with the space', () => {
    expect(ids('9876543210')).toEqual([1]);
    expect(ids('98765')).toEqual([1]);
    expect(ids('98765 43210')).toEqual([1]);
    expect(ids('9416')).toEqual([2]);
  });
  it('finds by address / locality', () => {
    expect(ids('gandhi')).toEqual([1]);
    expect(ids('bazar')).toEqual([2]);
  });
  it('finds by product (item) name and metal', () => {
    expect(ids('anklet')).toEqual([3, 2]);
    expect(ids('classic')).toEqual([3, 1]);
    expect(ids('silver')).toEqual([3, 2]);
  });
  it('finds by item weight, however it is typed', () => {
    expect(ids('10.5')).toEqual([1]);
    expect(ids('10.500')).toEqual([1]);
    expect(ids('38.5')).toEqual([2]);
    expect(ids('38.500')).toEqual([2]);
  });
  it('finds by total amount, with or without commas and rupee sign', () => {
    const total = Math.round(calcEstimate(a).grandTotal);
    expect(total).toBeGreaterThan(0);
    expect(ids(String(total))).toContain(1);
    expect(ids(new Intl.NumberFormat('en-IN').format(total))).toContain(1);
    expect(ids('₹' + new Intl.NumberFormat('en-IN').format(total))).toContain(1);
  });
  it('finds by date in the ways people type it', () => {
    expect(ids('2026-10-03')).toEqual([1]);
    expect(ids('03/10/2026')).toEqual([1]);
    expect(ids('3/10/2026')).toEqual([1]);
    expect(ids('03 oct 2026')).toEqual([1]);
    expect(ids('3 Oct 2026')).toEqual([1]);
    expect(ids('15 sep')).toEqual([2]);
    expect(ids('september')).toEqual([2]);
    expect(ids('2025')).toEqual([3]);
  });
  it('finds by bill number', () => {
    expect(ids('E-0002')).toEqual([2]);
    expect(ids('e-0003')).toEqual([3]);
    expect(ids('0001')).toContain(1);
  });
  it('several words must all match (narrows), and unrelated text finds nothing', () => {
    expect(ids('ramesh gandhi')).toEqual([1]);
    expect(ids('ramesh bazar')).toEqual([]);
    expect(ids('ramesh 10.5 oct')).toEqual([1]);
    expect(ids('zzzzqq')).toEqual([]);
  });
  it('an empty query returns nothing; matchesQuery treats empty as match', () => {
    expect(searchEstimates(all, '   ')).toEqual([]);
    expect(matchesQuery(a, '')).toBe(true);
  });
});


describe('PDF writer', () => {
  // A real (tiny) JPEG: the bytes only need to be carried through unchanged.
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
  const text = (u: Uint8Array) => Buffer.from(u).toString('latin1');

  it('builds a valid single-page A4 PDF whose cross-reference table points at every object', () => {
    const pdf = buildPdfFromJpegs([{ jpeg, width: 1588, height: 2246 }]);
    const t = text(pdf);
    expect(t.startsWith('%PDF-1.4')).toBe(true);
    expect(t.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(t).toContain(`/MediaBox [0 0 ${A4_PT.width} ${A4_PT.height}]`);
    expect(t).toContain('/Filter /DCTDecode');
    expect(t).toContain('/Count 1');
    // every xref offset lands exactly on "<n> 0 obj"
    const xrefAt = Number(/startxref\n(\d+)/.exec(t)![1]);
    expect(t.slice(xrefAt, xrefAt + 4)).toBe('xref');
    const entries = [...t.slice(xrefAt).matchAll(/(\d{10}) 00000 n /g)].map((m) => Number(m[1]));
    expect(entries.length).toBe(5); // catalog, page tree, page, contents, image
  });
  it('xref offsets are exact and the JPEG bytes are embedded untouched, for several pages', () => {
    const pdf = buildPdfFromJpegs([{ jpeg, width: 100, height: 141 }, { jpeg, width: 100, height: 141 }]);
    const t = text(pdf);
    expect(t).toContain('/Count 2');
    const xrefAt = Number(/startxref\n(\d+)/.exec(t)![1]);
    const offs = [...t.slice(xrefAt).matchAll(/(\d{10}) 00000 n /g)].map((m) => Number(m[1]));
    expect(offs.length).toBe(8); // 2 + 3 per page
    offs.forEach((o, i) => expect(t.slice(o, o + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
    // the JPEG appears once per page, byte for byte
    const marker = Buffer.from(jpeg);
    let hits = 0, from = 0;
    const buf = Buffer.from(pdf);
    while ((from = buf.indexOf(marker, from)) !== -1) { hits++; from += marker.length; }
    expect(hits).toBe(2);
  });
  it('refuses an empty document', () => {
    expect(() => buildPdfFromJpegs([])).toThrow();
  });
});


describe('searching the stock and cash registers', () => {
  const st = (o: Partial<StockEntry>): StockEntry => ({ id: Math.random().toString(36), date: '2026-10-03', type: 'in', metal: 'gold', item: 'Gold Ring – Classic', tunch: 91.6, weight: 10.5, pcs: 2, note: 'From party A', createdAt: '2026-10-03T10:00:00Z', ...o });
  const stock = [
    st({}),
    st({ type: 'out', metal: 'silver', item: 'Silver Anklet – Traditional', tunch: 92.5, weight: 250, pcs: 6, note: 'Sold to Ramesh', date: '2026-09-15' }),
    st({ metal: 'gold', item: 'Gold Chain – Daily Wear', tunch: 75, weight: 30.125, pcs: 1, note: '', date: '2025-12-31' }),
  ];
  const n = (q: string) => searchStock(stock, q).map((e) => e.item.split(' ')[1]);
  it('stock: by item / category, metal, weight, tunch, pieces, note and date', () => {
    expect(n('ring')).toEqual(['Ring']);
    expect(n('anklet')).toEqual(['Anklet']);
    expect(n('silver')).toEqual(['Anklet']);
    expect(n('10.5')).toEqual(['Ring']);
    expect(n('250')).toEqual(['Anklet']);
    expect(n('30.125')).toEqual(['Chain']);
    expect(n('92.5')).toEqual(['Anklet']);
    expect(n('75')).toContain('Chain');
    expect(n('party')).toEqual(['Ring']);
    expect(n('ramesh')).toEqual(['Anklet']);
    expect(n('15 sep')).toEqual(['Anklet']);
    expect(n('2026-10-03')).toEqual(['Ring']);
    expect(n('3/10/2026')).toEqual(['Ring']);
    expect(n('2025')).toEqual(['Chain']);
  });
  it('stock: several words narrow; empty keeps all; nonsense finds nothing', () => {
    expect(n('gold ring')).toEqual(['Ring']);
    expect(n('gold anklet')).toEqual([]);
    expect(searchStock(stock, '  ')).toHaveLength(3);
    expect(n('zzqq')).toEqual([]);
  });
  const cs = (o: Partial<CashEntry>): CashEntry => ({ id: Math.random().toString(36), date: '2026-10-03', type: 'in', amount: 0, note: '', createdAt: '2026-10-03T10:00:00Z', ...o });
  const cash = [cs({ amount: 50000, note: 'Sale – Ramesh' }), cs({ type: 'out', amount: 12000, note: 'Rent', date: '2026-09-01' }), cs({ amount: 2500, note: 'Advance' })];
  const c = (q: string) => searchCash(cash, q).map((e) => e.note.split(' ')[0]);
  it('cash: by amount (plain, commas, rupee sign), note and date', () => {
    expect(c('50000')).toEqual(['Sale']);
    expect(c('50,000')).toEqual(['Sale']);
    expect(c('₹12,000')).toEqual(['Rent']);
    expect(c('rent')).toEqual(['Rent']);
    expect(c('ramesh')).toEqual(['Sale']);
    expect(c('1 sep')).toEqual(['Rent']);
    expect(c('03/10/2026')).toEqual(['Sale', 'Advance']);
    expect(searchCash(cash, '')).toHaveLength(3);
  });
});

describe('bill status search', () => {
  it('finds bills by "pending" and "clear"', () => {
    const a = { ...sampleEstimate(DEFAULT_SETTINGS), id: 'a', number: 1, billStatus: 'pending' as const };
    const b = { ...sampleEstimate(DEFAULT_SETTINGS), id: 'b', number: 2, billStatus: 'clear' as const };
    const c = { ...sampleEstimate(DEFAULT_SETTINGS), id: 'c', number: 3 };
    expect(searchEstimates([a, b, c], 'pending').map((e) => e.id)).toEqual(['a']);
    expect(searchEstimates([a, b, c], 'clear').map((e) => e.id)).toEqual(['b']);
  });
});

describe('making charge on the bill', () => {
  it('gold (percent) prints the percentage, silver prints rupees', () => {
    const est = sampleEstimate(DEFAULT_SETTINGS);
    const html = renderEstimateHtml(est, { shopName: 'S.P. JEWELLERS', shopCode: '' });
    expect(html).toContain('<td>5%</td>'); // gold ring: 5 %
    expect(html).toMatch(/<td>(₹ ?)?900(\.00)?<\/td>/); // silver anklet: rupees
  });
});

describe('gold karat and default tunch', () => {
  it('new items start at gold 92, silver 100', () => {
    expect(newItem(DEFAULT_SETTINGS, 'gold').tunch).toBe(92);
    expect(newItem(DEFAULT_SETTINGS, 'silver').tunch).toBe(100);
  });
  it('22K gold ignores tunch; 24K uses it', () => {
    const base = sampleEstimate(DEFAULT_SETTINGS);
    const item = { ...base.items[0], metal: 'gold' as const, grossWt: 10, lessWt: 0, tunch: 92 };
    expect(fineWeight(item, { ...base.pricing, goldKarat: '24' })).toBe(9.2);
    expect(fineWeight(item, { ...base.pricing, goldKarat: '22' })).toBe(10);
  });
});

describe('stock matches for a sold item', () => {
  const mk = (id: string, type: 'in' | 'out', weight: number, item = 'Gold Ring – Classic', metal: 'gold' | 'silver' = 'gold', date = '2026-10-01') =>
    ({ id, date, type, metal, item, tunch: 92, weight, pcs: 1, note: '', createdAt: `${date}T10:00:0${id.length}Z` });
  const sold = { metal: 'gold' as const, description: 'gold ring – classic', weight: 5.5 };
  it('finds same category + same weight only', () => {
    const stock = [mk('a', 'in', 5.5), mk('bb', 'in', 5.5, 'Gold Ring – Classic', 'gold', '2026-10-02'), mk('c', 'in', 6), mk('d', 'in', 5.5, 'Gold Chain – Daily Wear'), mk('e', 'in', 5.5, 'Gold Ring – Classic', 'silver')];
    expect(stockMatchesForSale(stock, sold).map((e) => e.id)).toEqual(['bb', 'a']);
  });
  it('a piece already taken out (OUT of the same lot) is not offered again', () => {
    const a = mk('a', 'in', 5.5), b = mk('bb', 'in', 5.5, 'Gold Ring – Classic', 'gold', '2026-10-02');
    const out = saleOutEntry(a, 'o', '2026-10-05', 'Sold');
    expect(out.type).toBe('out');
    expect(stockMatchesForSale([a, b, out], sold).map((e) => e.id)).toEqual(['bb']);
    expect(stockMatchesForSale([a, b, out, saleOutEntry(b, 'p', '2026-10-05', 'Sold')], sold)).toEqual([]);
  });
});

describe('cloud sync merge', () => {
  const rec = (id: string, at: string, v = '') => ({ id, at, v });
  it('joins two lists by id, later stamp wins, nothing is lost', () => {
    const local = [rec('a', '2026-10-01', 'local'), rec('b', '2026-10-03', 'local-b')];
    const remote = [rec('a', '2026-10-02', 'remote'), rec('b', '2026-10-01', 'remote-b'), rec('c', '2026-10-01', 'remote-c')];
    const m = mergeById(local, remote, (x) => x.at);
    expect(m.map((x) => x.id).sort()).toEqual(['a', 'b', 'c']);
    expect(m.find((x) => x.id === 'a')?.v).toBe('remote');
    expect(m.find((x) => x.id === 'b')?.v).toBe('local-b');
  });
  it('a tie keeps the local record; merging twice changes nothing', () => {
    const l = [rec('a', '2026-10-01', 'L')];
    const r = [rec('a', '2026-10-01', 'R')];
    const once = mergeById(l, r, (x) => x.at);
    expect(once[0].v).toBe('L');
    expect(mergeById(once, r, (x) => x.at)).toEqual(once);
  });
  it('two bills with the same number: the older keeps it, the other gets the next free number', () => {
    const base = sampleEstimate(DEFAULT_SETTINGS);
    const a = { ...base, id: 'a', number: 5, createdAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-01T10:00:00Z' };
    const b = { ...base, id: 'b', number: 5, createdAt: '2026-10-02T10:00:00Z', updatedAt: '2026-10-02T10:00:00Z' };
    const c = { ...base, id: 'c', number: 6, createdAt: '2026-10-02T11:00:00Z', updatedAt: '2026-10-02T11:00:00Z' };
    const fixed = fixBillNumbers([a, b, c], '2026-10-05T00:00:00Z');
    expect(fixed.find((e) => e.id === 'a')?.number).toBe(5);
    expect(fixed.find((e) => e.id === 'b')?.number).toBe(7);
    expect(fixed.find((e) => e.id === 'c')?.number).toBe(6);
    expect(fixBillNumbers(fixed)).toEqual(fixed);
  });
});

describe('payments on a bill', () => {
  const bill = () => ({ ...sampleEstimate(DEFAULT_SETTINGS), id: 'b1', number: 3 });
  it('paid and balance follow each payment', () => {
    let e = bill();
    const total = calcEstimate(e).grandTotal;
    expect(balanceLeft(e)).toBe(total);
    e = withPayment(e, 1000, 'p1', '2026-10-05T10:00:00Z');
    e = withPayment(e, 500, 'p2', '2026-10-06T10:00:00Z');
    expect(paidTotal(e)).toBe(1500);
    expect(balanceLeft(e)).toBe(total - 1500);
    expect((e.payments ?? []).map((p) => p.id)).toEqual(['p1', 'p2']);
  });
  it('rules: saved bill, whole rupees, not above the balance, nothing after Clear', () => {
    const e = bill();
    const total = calcEstimate(e).grandTotal;
    expect(validatePayment({ ...e, number: 0 }, 100)).toMatch(/Save the bill/);
    expect(validatePayment(e, 0)).toMatch(/Enter the amount/);
    expect(validatePayment(e, 10.5)).toMatch(/whole rupees/);
    expect(validatePayment(e, total + 1)).toMatch(/is left/);
    expect(validatePayment(e, total)).toBeNull();
    expect(validatePayment({ ...e, billStatus: 'clear' }, 100)).toMatch(/Clear/);
  });
  it('the printed bill lists each payment with its day and date, then the balance', () => {
    const e = withPayment(bill(), 2000, 'p1', '2026-10-05T10:12:00');
    const html = renderEstimateHtml(e, { shopName: 'S.P. JEWELLERS', shopCode: '' });
    expect(html).toMatch(/Paid · Mon, 05 Oct, 2026/);
    expect(html).toContain('BALANCE');
    expect(renderEstimateHtml(bill(), { shopName: 'S.P. JEWELLERS', shopCode: '' })).not.toContain('BALANCE');
  });
  it('merging two devices keeps every payment and a Clear stays Clear', () => {
    const base = bill();
    const a = withPayment(base, 100, 'pa', '2026-10-05T10:00:00Z');
    const b = { ...withPayment(base, 200, 'pb', '2026-10-05T11:00:00Z'), billStatus: 'clear' as const };
    const m = mergeBills([a], [b])[0];
    expect((m.payments ?? []).map((p) => p.id)).toEqual(['pa', 'pb']);
    expect(m.billStatus).toBe('clear');
    expect(mergeBills([m], [a])[0]).toEqual(m);
  });
});

describe('bill closing lines', () => {
  it('the A4 bill ends with a thank-you only: no shop name in it, no estimate note, no contact line', () => {
    const html = renderEstimateHtml(sampleEstimate(DEFAULT_SETTINGS), { shopName: 'S.P. JEWELLERS', shopCode: '', ownerName: 'Sandeep Soni', ownerPhone: '94166 25950', address: 'Main Bazar, Ellenabad' });
    expect(html).toContain('Thank you for visiting!');
    expect(html).not.toContain('Thank you for visiting S.P. JEWELLERS');
    expect(html).toContain('Please visit us again.');
    expect(html).not.toContain('not a tax invoice');
    expect(html).not.toContain('thanks-contact');
  });
});

describe('tagline under the shop name', () => {
  it('prints between the shop name and the address', () => {
    const html = renderEstimateHtml(sampleEstimate(DEFAULT_SETTINGS), { shopName: 'S.P. JEWELLERS', shopCode: '', address: 'Main Bazar, Ellenabad', tagline: 'Manufacturer of Gold & Silver Ornaments' });
    const a = html.indexOf('S.P. JEWELLERS'), t = html.indexOf('Manufacturer of Gold &amp; Silver Ornaments'), d = html.indexOf('Main Bazar, Ellenabad');
    expect(a).toBeGreaterThan(-1);
    expect(t).toBeGreaterThan(a);
    expect(d).toBeGreaterThan(t);
    expect(renderEstimateHtml(sampleEstimate(DEFAULT_SETTINGS), { shopName: 'X', shopCode: '', address: 'Y' })).not.toContain('class="tagline"');
  });
});

describe('old gold given instead of money', () => {
  it('its value = weight x purity x (1 - cut) x rate per gram', () => {
    expect(goldPaymentValue({ weight: 10, purity: 92, rate: 72000, cutPct: 0 })).toBe(66240);
    expect(goldPaymentValue({ weight: 10, purity: 100, rate: 72000, cutPct: 5 })).toBe(68400);
    expect(goldPaymentValue({ weight: 0, purity: 92, rate: 72000, cutPct: 0 })).toBe(0);
  });
  it('is cut from the bill and printed with the gold details', () => {
    const e = { ...sampleEstimate(DEFAULT_SETTINGS), id: 'g1', number: 2 };
    const value = goldPaymentValue({ weight: 5, purity: 92, rate: 72000, cutPct: 0 });
    const paid = withPayment(e, value, 'pg', '2026-10-05T10:12:00', { mode: 'gold', gold: { weight: 5, karat: 22, purity: 92, rate: 72000, cutPct: 0 } });
    expect(balanceLeft(paid)).toBe(balanceLeft(e) - value);
    const html = renderEstimateHtml(paid, { shopName: 'S.P. JEWELLERS', shopCode: '' });
    expect(html).toMatch(/Paid · Submitted gold 5 g @ ₹[\d,]+ \/ 10 g · Mon, 05 Oct, 2026/);
    const upi = withPayment(e, 100, 'pu', '2026-10-05T10:12:00', { mode: 'upi' });
    expect(renderEstimateHtml(upi, { shopName: 'X', shopCode: '' })).toContain('Paid · UPI · ');
  });
});

describe('net gold / silver weight on the bill', () => {
  const base = () => {
    const e = { ...sampleEstimate(DEFAULT_SETTINGS), id: 'n1', number: 4 };
    e.items = [
      { ...e.items[0], id: 'g1', metal: 'gold' as const, grossWt: 12, lessWt: 0 },
      { ...e.items[0], id: 'g2', metal: 'gold' as const, grossWt: 3, lessWt: 0 },
      { ...e.items[0], id: 's1', metal: 'silver' as const, grossWt: 40, lessWt: 0 },
    ];
    return e;
  };
  it('net = gross weight on the bill - weight the customer submitted, per metal', () => {
    let e = base();
    expect(netMetalWeight(e, 'gold')).toBe(15);
    e = { ...e, submitted: { gold: 5.5, silver: 10 } };
    expect(submittedWeight(e, 'gold')).toBe(5.5);
    expect(submittedWeight(e, 'silver')).toBe(10);
    expect(netMetalWeight(e, 'gold')).toBe(9.5);
    expect(netMetalWeight(e, 'silver')).toBe(30);
  });
  it('the printed bill has one simple "Submitted … g gold" row only for a metal the customer submitted (no Net Wt. rows)', () => {
    const e = { ...base(), submitted: { gold: 5.5 } };
    const html = renderEstimateHtml(e, { shopName: 'S.P. JEWELLERS', shopCode: '' });
    expect(html).toContain('Submitted 5.5 g gold @ ₹72,000 / 10 g');
    expect(html).not.toContain('Net Gold Wt.');
    expect(html).not.toContain('Net Silver Wt.');
    expect(html).not.toContain('Submitted 0 g');
    expect(renderEstimateHtml(base(), { shopName: 'S.P. JEWELLERS', shopCode: '' })).not.toContain('Submitted');
    const htmlBoth = renderEstimateHtml({ ...base(), submitted: { gold: 5.5, silver: 10 } }, { shopName: 'S.P. JEWELLERS', shopCode: '' });
    expect(htmlBoth).toContain('Submitted 10 g silver @ ₹2,310 / 10 g');
    expect(htmlBoth).toContain('Submitted 5.5 g gold @ ₹72,000 / 10 g');
  });
});

describe('submitted gold / silver valued at its own rate and cut from the bill', () => {
  const bill = () => {
    const e = { ...sampleEstimate(DEFAULT_SETTINGS), id: 'sub1', number: 7 };
    e.pricing = { ...e.pricing, goldRate: 72000, goldRateUnit: 'per_10g', silverRate: 9000, silverRateUnit: 'per_10g' };
    e.items = [
      { ...e.items[0], id: 'g1', metal: 'gold' as const, grossWt: 10, lessWt: 0, tunch: 92, karat: 22, labourRate: 0, labourMode: 'fixed' as const },
      { ...e.items[0], id: 's1', metal: 'silver' as const, grossWt: 100, lessWt: 0, tunch: 100, labourRate: 0, labourMode: 'fixed' as const },
    ];
    e.otherCharges = [];
    e.pricing.gstEnabled = false;
    return e;
  };
  it('without its own rate it is valued at the bill\'s 24K rate, at the purity of the metal bought', () => {
    const e = bill();
    const base = calcEstimate(e);
    expect(base.grandTotal).toBe(66240 + 90000);
    expect(boughtPurity(e.items, 'gold')).toBe(92);
    expect(submittedRate({ ...e, submitted: { gold: 5 } }, 'gold')).toBe(72000);
    const t = calcEstimate({ ...e, submitted: { gold: 5, silver: 20, goldPurity: 92 } });
    expect(t.submittedCredit.gold).toBe(33120); // 5 g x 92 % x 7,200
    expect(t.submittedCredit.silver).toBe(18000); // 20 g x 100 % x 900
    expect(t.grandTotal).toBe(base.grandTotal - 33120 - 18000);
  });
  it('a rate typed for the submission applies to that submission only', () => {
    const e = bill();
    const t = calcEstimate({ ...e, submitted: { gold: 5, goldRate: 75000, goldPurity: 92 } });
    expect(t.submittedCredit.gold).toBe(34500); // 5 g x 92 % x 7,500
    expect(t.items[0].amount).toBe(66240); // the gold bought is still priced at the bill's own rate
    expect(submittedRate({ ...e, submitted: { gold: 5, goldRate: 75000 } }, 'gold')).toBe(75000);
  });
  it('the submitted metal is valued at 100 % unless a percentage is typed', () => {
    expect(calcEstimate({ ...bill(), submitted: { gold: 5, goldRate: 75000 } }).submittedCredit.gold).toBe(37500);
  });
  it('is checked: not negative (metal not sold on the bill can still be cut)', () => {
    const e = bill();
    expect(validateEstimate({ ...e, submitted: { gold: 12 } }).some((i) => /more than the gold/.test(i.message))).toBe(false);
    expect(validateEstimate({ ...e, submitted: { silver: -1 } }).some((i) => /cannot be negative/.test(i.message))).toBe(true);
    expect(validateEstimate({ ...e, submitted: { gold: 10, silver: 100 } }).filter((i) => /Submitted/.test(i.message))).toEqual([]);
  });
  it('the printed bill has one Submitted row with the weight, the rate and the value; no karat printed', () => {
    const e = { ...bill(), submitted: { gold: 5, goldRate: 75000, goldPurity: 92 } };
    const html = renderEstimateHtml(e, { shopName: 'S.P. JEWELLERS', shopCode: '' });
    expect(html).toContain('Submitted 5 g gold @ ₹75,000 / 10 g');
    expect(html).toContain('−₹34,500');
    expect(html).not.toContain('silver @');
    expect(html).not.toContain('22K');
  });
  it('gold submitted later is a payment: its weight and a rate for that one, same purity as bought', () => {
    const e = { ...bill(), submitted: undefined };
    const value = goldPaymentValue({ weight: 5, purity: boughtPurity(e.items, 'gold'), rate: 75000, cutPct: 0 });
    expect(value).toBe(34500);
    const paid = withPayment(e, value, 'pl', '2026-10-06T10:00:00', { mode: 'gold', gold: { weight: 5, karat: 22, purity: 92, rate: 75000, cutPct: 0 } });
    expect(balanceLeft(paid)).toBe(balanceLeft(e) - 34500);
    expect(renderEstimateHtml(paid, { shopName: 'S.P. JEWELLERS', shopCode: '' })).toContain('Paid · Submitted gold 5 g @ ₹75,000 / 10 g · ');
  });
});

describe('order id', () => {
  const bill = (id: string, number: number, name: string, phone: string, orderId?: number) =>
    ({ ...newEstimate(DEFAULT_SETTINGS), id, number, customerName: name, customerPhone: phone, orderId });
  it('the same phone number keeps one order id; anything else gets a random 4-digit one', () => {
    const saved = [bill('a', 1, 'Ramesh Soni', '98765 43210', 4321), bill('b', 2, 'Sunita', '90000 11111', 1000)];
    expect(assignOrderId(bill('c', 0, 'Someone', '9876543210'), saved)).toBe(4321);
    expect(assignOrderId(bill('d', 0, 'Ramesh Soni', '91111 22222'), saved, () => 0.5)).toBe(5500);
    expect(assignOrderId(bill('e', 0, '', ''), saved, () => 0)).toBe(1001); // 1000 is taken
    const r = assignOrderId(bill('f', 0, 'New', '1'), saved);
    expect(r).toBeGreaterThanOrEqual(1000); expect(r).toBeLessThanOrEqual(9999);
  });
});
