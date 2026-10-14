import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from 'obsidian-test-mocks/obsidian';
import Plugin from '../src/main';
import { SPONSORS, PRO_UI, bindPro, isPro, resetPro, onProChange } from '../src/pro';
import manifest from '../manifest.json';
afterEach(resetPro);

describe('plugin and Pro', () => {
 it('loads empty local settings', async () => {
  const app=App.createConfigured__({files:{'a.md':'A'}});
  const plugin=new Plugin(app as never,manifest as never);
  await plugin.loadSettings();
  expect(plugin.settings).toEqual({pairs:{}});
  expect(isPro()).toBe(false);
 });
 it('uses the reference sponsor terms', () => {
  expect(SPONSORS).toEqual({clientId:'Ov23lic5UPGPZqhBlBGg',sponsorLogin:'theluckystrike',minMonthlyUsd:5,oneTimeUsd:15,oneTimeMonths:0,scope:'read:user'});
  expect(PRO_UI.priceText).toBe('Sponsor $5 a month, or $15 once. When you have paid $15 in total, Pro stays on.');
 });
 it('follows sponsor state and disposes listeners', () => {
  let active=false; let callback=()=>{}; const off=vi.fn();
  bindPro({isPro:()=>active,onChange:(f:()=>void)=>{callback=f;return off;}} as never);
  const listener=vi.fn(); const unsubscribe=onProChange(listener);
  active=true;callback();expect(isPro()).toBe(true);expect(listener).toHaveBeenCalledOnce();
  unsubscribe();active=false;callback();expect(listener).toHaveBeenCalledOnce();
  resetPro();expect(off).toHaveBeenCalledOnce();expect(isPro()).toBe(false);
 });
});
