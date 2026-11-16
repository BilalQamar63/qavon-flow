import { QAVONFLOW_BRANDING } from '../../src/constants/branding.ts';

export interface EmailContent {
  text: string;
  html: string;
}

interface BrandedEmailTemplate {
  preheader: string;
  heading: string;
  greeting?: string;
  paragraphs: string[];
  buttonLabel: string;
  url: string;
  footerNote: string;
}

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPE_MAP[character]);
}

function renderBrandedEmail(template: BrandedEmailTemplate): string {
  const safeUrl = escapeHtml(template.url);
  const greeting = template.greeting
    ? `<p style="margin:0 0 18px;font-size:16px;line-height:1.6;color:#242424;">${escapeHtml(template.greeting)}</p>`
    : '';
  const paragraphs = template.paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:0 0 18px;font-size:16px;line-height:1.6;color:#424242;">${escapeHtml(paragraph)}</p>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(template.heading)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f4f2ee;font-family:Arial,Helvetica,sans-serif;color:#242424;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(template.preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f2ee;">
      <tr>
        <td align="center" style="padding:36px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border:1px solid #e8e4dc;border-radius:10px;overflow:hidden;">
            <tr>
              <td style="height:5px;background-color:#eda320;font-size:0;line-height:0;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:26px 32px;background-color:#191919;">
                <div style="font-size:22px;font-weight:700;letter-spacing:-0.3px;color:#ffffff;">${escapeHtml(QAVONFLOW_BRANDING.name)}</div>
                <div style="margin-top:5px;font-size:10px;font-weight:700;letter-spacing:1.5px;color:#eda320;">${escapeHtml(QAVONFLOW_BRANDING.byline)}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:34px 32px 18px;">
                <h1 style="margin:0 0 22px;font-size:25px;line-height:1.25;color:#191919;">${escapeHtml(template.heading)}</h1>
                ${greeting}
                ${paragraphs}
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0;">
                  <tr>
                    <td align="center" bgcolor="#eda320" style="border-radius:6px;">
                      <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 24px;border:1px solid #eda320;border-radius:6px;font-size:15px;font-weight:700;line-height:1.2;color:#191919;text-decoration:none;">${escapeHtml(template.buttonLabel)}</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#666666;">If the button doesn’t work, copy and paste this link into your browser:</p>
                <p style="margin:0 0 22px;font-size:13px;line-height:1.5;word-break:break-all;"><a href="${safeUrl}" style="color:#805300;text-decoration:underline;">${safeUrl}</a></p>
                <p style="margin:0;padding-top:18px;border-top:1px solid #eeeae3;font-size:13px;line-height:1.5;color:#777777;">${escapeHtml(template.footerNote)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px;background-color:#faf9f7;font-size:12px;line-height:1.5;color:#777777;">
                ${escapeHtml(QAVONFLOW_BRANDING.name)} · ${escapeHtml(QAVONFLOW_BRANDING.signature)}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function buildMagicLinkEmail(magicUrl: string): EmailContent {
  return {
    text: `Sign in to ${QAVONFLOW_BRANDING.name} (by ${QAVONFLOW_BRANDING.owner}) using this single-use link (expires in 15 minutes): ${magicUrl}\n\nIf you did not request this link, you can ignore this email.`,
    html: renderBrandedEmail({
      preheader: 'Your secure, single-use sign-in link is ready.',
      heading: 'Your sign-in link is ready',
      paragraphs: [
        `Use the button below to sign in to ${QAVONFLOW_BRANDING.name}. This single-use link expires in 15 minutes.`,
      ],
      buttonLabel: 'Sign in securely',
      url: magicUrl,
      footerNote: 'If you did not request this sign-in link, you can safely ignore this email.',
    }),
  };
}

export function buildPortalInvitationEmail(params: {
  contactName: string;
  companyName: string;
  portalUrl: string;
  reminder?: boolean;
}): EmailContent {
  const greeting = `Hello ${params.contactName.trim() || 'there'},`;
  const action = params.reminder
    ? 'Your onboarding workspace invitation is still waiting.'
    : `You have been invited to access the private onboarding workspace for ${params.companyName}.`;

  return {
    text: `${greeting} ${action} Open your QavonFlow workspace here: ${params.portalUrl}\n\nIf you were not expecting this invitation, you can ignore this email.`,
    html: renderBrandedEmail({
      preheader: `Access your private ${QAVONFLOW_BRANDING.name} onboarding workspace.`,
      heading: params.reminder ? 'Your invitation is waiting' : 'Your workspace is ready',
      greeting,
      paragraphs: [
        action,
        'Share project details, upload files, and track onboarding progress in one private workspace.',
      ],
      buttonLabel: 'Open onboarding workspace',
      url: params.portalUrl,
      footerNote: 'If you were not expecting this invitation, you can safely ignore this email.',
    }),
  };
}
