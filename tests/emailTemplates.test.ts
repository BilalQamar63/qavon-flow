import { describe, expect, it } from 'vitest';
import {
  buildMagicLinkEmail,
  buildPortalInvitationEmail,
} from '../server/services/emailTemplates';

describe('branded email templates', () => {
  it('renders a styled magic-link email with a plain-text fallback', () => {
    const email = buildMagicLinkEmail('https://qavonflow.example/?magicToken=one-time');

    expect(email.text).toContain('single-use link');
    expect(email.text).toContain('expires in 15 minutes');
    expect(email.html).toContain('Sign in securely');
    expect(email.html).toContain('https://qavonflow.example/?magicToken=one-time');
    expect(email.html).toContain('QavonFlow');
  });

  it('escapes user-provided invitation content and link attributes', () => {
    const email = buildPortalInvitationEmail({
      contactName: '<img src=x onerror=alert(1)>',
      companyName: 'A&B <Studio>',
      portalUrl: 'https://qavonflow.example/?portalToken=one-time&source=email',
    });

    expect(email.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(email.html).toContain('A&amp;B &lt;Studio&gt;');
    expect(email.html).toContain('portalToken=one-time&amp;source=email');
    expect(email.html).not.toContain('<img src=x');
    expect(email.text).toContain('A&B <Studio>');
  });
});
