import type { Role } from './types';

export interface BugReportContext {
  /** Repository page on the tracker, e.g. https://github.com/owner/repo */
  trackerUrl: string;
  version: string;
  /** Current path. Query string and hash are dropped. */
  page: string;
  role: Role;
  userAgent: string;
  now: Date;
}

/**
 * Link to a new issue on the tracker with the bug report form partly filled in. It only
 * carries what helps reproduce a bug: never names, amounts or anything else from the ledger.
 */
export function bugReportUrl(ctx: BugReportContext): string {
  const params = new URLSearchParams({
    template: 'bug_report.yml',
    title: '[Bug] ',
    version: ctx.version,
    page: ctx.page.replace(/[?#].*$/, ''),
    environment: [
      `Role: ${ctx.role}`,
      `Browser: ${ctx.userAgent}`,
      `Time: ${ctx.now.toISOString()}`,
    ].join('\n'),
  });
  return `${ctx.trackerUrl.replace(/\/+$/, '')}/issues/new?${params}`;
}
