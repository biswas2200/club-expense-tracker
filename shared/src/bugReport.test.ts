import { describe, expect, it } from 'vitest';
import { bugReportUrl } from './bugReport';

const base = {
  trackerUrl: 'https://github.com/biswas2200/club-expense-tracker',
  version: '0.2.0',
  page: '/events/abc123',
  role: 'member' as const,
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/140',
  now: new Date('2026-10-21T09:30:00Z'),
};

function params(url: string) {
  return new URL(url).searchParams;
}

describe('bugReportUrl', () => {
  it("opens the tracker's new-issue page with the bug report form", () => {
    const url = new URL(bugReportUrl(base));
    expect(url.origin + url.pathname).toBe(
      'https://github.com/biswas2200/club-expense-tracker/issues/new',
    );
    expect(url.searchParams.get('template')).toBe('bug_report.yml');
  });

  it('copes with a trailing slash on the tracker URL', () => {
    const url = new URL(bugReportUrl({ ...base, trackerUrl: base.trackerUrl + '/' }));
    expect(url.pathname).toBe('/biswas2200/club-expense-tracker/issues/new');
  });

  it('fills in the version, page and environment fields', () => {
    const p = params(bugReportUrl(base));
    expect(p.get('version')).toBe('0.2.0');
    expect(p.get('page')).toBe('/events/abc123');
    const env = p.get('environment')!;
    expect(env).toContain('Role: member');
    expect(env).toContain('Browser: Mozilla/5.0 (X11; Linux x86_64) Chrome/140');
    expect(env).toContain('Time: 2026-10-21T09:30:00.000Z');
  });

  it('drops the query string and hash from the page, which may carry form data', () => {
    const p = params(bugReportUrl({ ...base, page: '/events/abc123?amount=1200#entry-5' }));
    expect(p.get('page')).toBe('/events/abc123');
  });

  it('starts the title with [Bug] so the reporter only adds a summary', () => {
    expect(params(bugReportUrl(base)).get('title')).toBe('[Bug] ');
  });
});
