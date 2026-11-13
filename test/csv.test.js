const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCsv } = require('../src/shared/csv');

test('parseCsv strips BOM and handles CRLF', () => {
  const rows = parseCsv('﻿a,b\r\n1,2\r\n');
  assert.deepEqual(rows, [['a', 'b'], ['1', '2']]);
});

test('parseCsv keeps commas inside quotes (Thai name)', () => {
  const rows = parseCsv('x,"น้ำยา, 3,700มล.",y\n');
  assert.deepEqual(rows, [['x', 'น้ำยา, 3,700มล.', 'y']]);
});

test('parseCsv unescapes doubled quotes', () => {
  const rows = parseCsv('a,"10"" โต",c\n');
  assert.deepEqual(rows, [['a', '10" โต', 'c']]);
});

test('parseCsv allows newline inside quotes', () => {
  const rows = parseCsv('a,"l1\nl2"\nb,c\n');
  assert.deepEqual(rows, [['a', 'l1\nl2'], ['b', 'c']]);
});

test('parseCsv keeps trailing empty field', () => {
  assert.deepEqual(parseCsv('a,b,\n'), [['a', 'b', '']]);
});
