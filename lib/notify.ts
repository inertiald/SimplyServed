import "server-only";

export type OtpChannel = "email" | "phone";

export interface OtpMessage {
  channel: OtpChannel;
  to: string;
  code: string;
  context?: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  context?: string;
}

export interface SmsMessage {
  to: string;
  body: string;
  context?: string;
}

export interface Notifier {
  sendOtp(message: OtpMessage): Promise<void>;
  sendEmail(message: EmailMessage): Promise<void>;
  sendSms(message: SmsMessage): Promise<void>;
}

const consoleNotifier: Notifier = {
  async sendOtp(message) {
    console.log(`[${message.context ?? "notify"}] OTP via ${message.channel} to ${message.to}: ${message.code}`);
  },
  async sendEmail(message) {
    console.log(`[${message.context ?? "notify"}] Email to ${message.to}: ${message.subject}`);
  },
  async sendSms(message) {
    console.log(`[${message.context ?? "notify"}] SMS to ${message.to}: ${message.body}`);
  },
};

class ResendNotifier implements Notifier {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async sendOtp(message: OtpMessage): Promise<void> {
    if (message.channel !== "email") {
      throw new Error("Resend only supports email notifications");
    }
    await this.sendEmail({
      to: message.to,
      subject: "Your SimplyServed verification code",
      text: `Your verification code is ${message.code}. It expires in 15 minutes.`,
      context: message.context,
    });
  }

  async sendEmail(message: EmailMessage): Promise<void> {
    const authorization = ["Bearer", this.apiKey].join(" ");
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
    });
    if (!res.ok) {
      throw new Error(`Resend request failed: ${res.status} ${res.statusText}`);
    }
  }

  async sendSms(_message: SmsMessage): Promise<void> {
    throw new Error("Resend does not support SMS notifications");
  }
}

class TwilioNotifier implements Notifier {
  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly from: string,
  ) {}

  async sendOtp(message: OtpMessage): Promise<void> {
    if (message.channel !== "phone") {
      throw new Error("Twilio only supports SMS notifications");
    }
    await this.sendSms({
      to: message.to,
      body: `Your SimplyServed verification code is ${message.code}. It expires in 15 minutes.`,
      context: message.context,
    });
  }

  async sendEmail(_message: EmailMessage): Promise<void> {
    throw new Error("Twilio does not support email notifications");
  }

  async sendSms(message: SmsMessage): Promise<void> {
    const params = new URLSearchParams({
      To: message.to,
      From: this.from,
      Body: message.body,
    });
    const basicAuth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64");
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(this.accountSid)}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${basicAuth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params,
      },
    );
    if (!res.ok) {
      throw new Error(`Twilio request failed: ${res.status} ${res.statusText}`);
    }
  }
}

class RoutedNotifier implements Notifier {
  constructor(
    private readonly emailNotifier: Notifier,
    private readonly smsNotifier: Notifier,
  ) {}

  async sendOtp(message: OtpMessage): Promise<void> {
    if (message.channel === "email") {
      await this.emailNotifier.sendOtp(message);
      return;
    }
    await this.smsNotifier.sendOtp(message);
  }

  async sendEmail(message: EmailMessage): Promise<void> {
    await this.emailNotifier.sendEmail(message);
  }

  async sendSms(message: SmsMessage): Promise<void> {
    await this.smsNotifier.sendSms(message);
  }
}

class FailSoftNotifier implements Notifier {
  constructor(
    private readonly primary: Notifier,
    private readonly fallback: Notifier,
  ) {}

  async sendOtp(message: OtpMessage): Promise<void> {
    await this.withFallback("sendOtp", message.context, () => this.primary.sendOtp(message), () => this.fallback.sendOtp(message));
  }

  async sendEmail(message: EmailMessage): Promise<void> {
    await this.withFallback("sendEmail", message.context, () => this.primary.sendEmail(message), () => this.fallback.sendEmail(message));
  }

  async sendSms(message: SmsMessage): Promise<void> {
    await this.withFallback("sendSms", message.context, () => this.primary.sendSms(message), () => this.fallback.sendSms(message));
  }

  private async withFallback(
    operation: "sendOtp" | "sendEmail" | "sendSms",
    context: string | undefined,
    runPrimary: () => Promise<void>,
    runFallback: () => Promise<void>,
  ): Promise<void> {
    try {
      await runPrimary();
    } catch (error) {
      console.warn(`[${context ?? "notify"}] ${operation} failed, using console notifier: ${formatError(error)}`);
      await runFallback();
    }
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function createResendNotifier(): Notifier | null {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!key || !from) return null;
  return new ResendNotifier(key, from);
}

function createTwilioNotifier(): Notifier | null {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  if (!sid || !token || !from) return null;
  return new TwilioNotifier(sid, token, from);
}

export function getNotifier(): Notifier {
  const resend = createResendNotifier();
  const twilio = createTwilioNotifier();
  if (!resend && !twilio) return consoleNotifier;
  const routed = new RoutedNotifier(resend ?? consoleNotifier, twilio ?? consoleNotifier);
  return new FailSoftNotifier(routed, consoleNotifier);
}
