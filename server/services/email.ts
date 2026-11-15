import nodemailer, { type Transporter } from 'nodemailer';
import { serverConfig } from '../config.ts';
import { recordSecurityLog } from './audit.ts';

export interface EmailDispatchResult {
  configured: boolean;
  delivered: boolean;
  reason?: string;
}

export interface EmailPayload {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailProvider {
  isConfigured(): boolean;
  send(payload: EmailPayload): Promise<EmailDispatchResult>;
}

class NodemailerSmtpProvider implements EmailProvider {
  private cachedKey = '';
  private cachedTransport: Transporter | null = null;

  isConfigured(): boolean {
    return Boolean(
      serverConfig.smtp.host &&
        serverConfig.smtp.user &&
        serverConfig.smtp.pass &&
        serverConfig.smtp.from,
    );
  }

  private getTransporter(): Transporter {
    const { host, port, user, pass } = serverConfig.smtp;
    const configKey = `${host}:${port}:${user}:${pass.length}`;
    if (this.cachedTransport && this.cachedKey === configKey) {
      return this.cachedTransport;
    }

    this.cachedKey = configKey;
    this.cachedTransport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass,
      },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
    return this.cachedTransport;
  }

  resetCache(): void {
    this.cachedKey = '';
    this.cachedTransport = null;
  }

  async send(payload: EmailPayload): Promise<EmailDispatchResult> {
    if (!this.isConfigured()) {
      return {
        configured: false,
        delivered: false,
        reason:
          'SMTP provider is not configured in environment variables (SMTP_HOST, SMTP_USER, SMTP_PASS, EMAIL_FROM). Link generated for manual or preview verification.',
      };
    }

    try {
      const transporter = this.getTransporter();
      await transporter.sendMail({
        from: serverConfig.smtp.from,
        to: payload.to,
        subject: payload.subject,
        text: payload.text,
        ...(payload.html ? { html: payload.html } : {}),
      });
      return {
        configured: true,
        delivered: true,
      };
    } catch (err: unknown) {
      recordSecurityLog('smtp_send_failed', {
        host: serverConfig.smtp.host,
        port: serverConfig.smtp.port,
        errorName: err instanceof Error ? err.name : 'UnknownSmtpError',
      });
      return {
        configured: true,
        delivered: false,
        reason:
          'Unable to send email via SMTP relay. Check Brevo SMTP credentials and verified sender address, or use the generated link.',
      };
    }
  }
}

const providerInstance = new NodemailerSmtpProvider();
export const emailProvider: EmailProvider = providerInstance;

export function resetEmailTransportCacheForTests(): void {
  providerInstance.resetCache();
}
