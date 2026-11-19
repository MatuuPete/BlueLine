import type { Page } from '@playwright/test';
import { expect } from './fixtures';

const PARLAY =
  '4-leg SGM: Jake LaRavia Over 1.5 Assists · Mo Bamba Under 20.5 Pts+Ast+Reb · Luka Doncic Over 3.5 Threes · Walker Kessler Over 1.5 Assists';

/** A 4-leg pending SGM plus a loss, a win and a pending single, all placed today. */
export async function seedBets(page: Page) {
  const day = new Date().toLocaleDateString('en-CA');
  const bets = [
    {
      description: PARLAY,
      event: 'Los Angeles Lakers vs Utah Jazz',
      betType: 'parlay',
      legs: 4,
      odds: { decimal: 8.4 },
      stake: 250,
      result: 'pending',
    },
    {
      description: 'LeBron James Over 13.5 Assists + Rebounds',
      event: 'Orlando Magic vs Philadelphia 76ers',
      odds: { decimal: 1.53 },
      stake: 250,
      result: 'loss',
    },
    {
      description: 'Philadelphia 76ers to win (incl. OT)',
      event: 'Orlando Magic vs Philadelphia 76ers',
      odds: { decimal: 2.55 },
      stake: 255,
      result: 'win',
    },
    {
      description: 'Cade Cunningham Over 24.5 Points',
      event: 'New Orleans Pelicans vs Detroit Pistons',
      odds: { decimal: 1.65 },
      stake: 250,
      result: 'pending',
    },
  ];
  for (const b of bets) {
    const res = await page.request.post('/api/bets', {
      data: { sport: 'NBA', book: 'Stake', placedOn: day, ...b },
    });
    expect(res.ok(), await res.text()).toBe(true);
  }
}
