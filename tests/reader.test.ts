import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import * as reader from '../src/reader';
import { normalizeSettings } from '../src/settings';
import vectors from './fixtures/vectors.json';

describe('golden cases', () => {
 for (const c of vectors.cases) it(c.name, () => {
  const f = ('function' in c ? c.function : vectors.function) as keyof typeof reader;
  const fn = reader[f] as (...args: unknown[]) => unknown;
  expect(fn(...c.args)).toEqual(c.expected);
 });
 const path = '../../packages/spec/vectors/parallel-paragraph-reader.json';
 it.skipIf(!existsSync(path))('the export fixture matches the factory vectors', () => {
  expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(vectors);
 });
});

it('100 blocks are accepted and 101 are refused', () => {
 const text = Array.from({length:100},(_,i)=>String(i)).join('\n\n');
 expect(reader.buildReading(text,text).rows).toHaveLength(100);
 expect(reader.buildReading(text+'\n\nextra',text).error).toContain('100 prose');
});
it('large sources are refused', () => expect(reader.buildReading('a'.repeat(1_000_001),'').error).not.toBeNull());
it('pair keys preserve side and path boundaries', () => {
 expect(reader.pairKey('a','b')).not.toBe(reader.pairKey('b','a'));
 expect(reader.pairKey('a|b','c')).not.toBe(reader.pairKey('a','b|c'));
});
it('stamp ignores excluded headers but tracks prose edits', () => {
 const blocks=reader.extractProse;
 expect(reader.contentStamp(blocks('# A\n\nText'),[])).toBe(reader.contentStamp(blocks('# B\n\nText'),[]));
 expect(reader.contentStamp(blocks('Text'),[])).not.toBe(reader.contentStamp(blocks('Edit'),[]));
});
it('alignment round trip retains gaps', () => {
 const map: reader.Alignment=[[0,0],[1,null],[null,1]];
 expect(reader.parseAlignment(reader.alignmentText(map),2,2)).toEqual(map);
});
it('invalid saved data is removed', () => {
 expect(normalizeSettings(null)).toEqual({pairs:{}});
 expect(normalizeSettings({pairs:{x:{row:-1,stamp:'',map:[]}}})).toEqual({pairs:{}});
 expect(normalizeSettings({pairs:{x:{row:0,stamp:'a',map:[[99,0]]}}})).toEqual({pairs:{}});
});
it('saved pair count is limited to 50', () => {
 const pairs=Object.fromEntries(Array.from({length:60},(_,i)=>[String(i),{stamp:'x',row:0,map:null}]));
 expect(Object.keys(normalizeSettings({pairs}).pairs)).toHaveLength(50);
});
