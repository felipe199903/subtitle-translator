/** Sends e-mail through Resend's HTTP API; without a key (local dev) it prints the message instead. */
export type Mailer = (to: string, subject: string, html: string, text: string) => Promise<void>;

export const resendMailer: Mailer = async (to, subject, html, text) => {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.VERCEL) throw new Error('RESEND_API_KEY não definida: não é possível enviar o link de acesso.');
    console.log(`\n✉️  E-mail para ${to}: ${subject}\n${text}\n`);
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || 'Subtitle Translator <nao-responda@subtitle-translator.com.br>',
      to: [to],
      subject,
      html,
      text,
    }),
  });
  if (!res.ok) throw new Error(`Resend respondeu ${res.status}: ${(await res.text()).slice(0, 200)}`);
};

const escape = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function magicLinkEmail(url: string) {
  const subject = 'Seu link de acesso ao Subtitle Translator';
  const text = `Use o link abaixo para entrar. Ele vale por 15 minutos e só pode ser usado uma vez.\n\n${url}\n\nSe você não pediu este e-mail, ignore-o.`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;color:#18181b">
  <h2 style="color:#4f46e5">Subtitle Translator</h2>
  <p>Clique no botão para entrar. O link vale por 15 minutos e só pode ser usado uma vez.</p>
  <p><a href="${escape(url)}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Entrar</a></p>
  <p style="font-size:13px;color:#71717a">Se o botão não funcionar, copie este endereço: ${escape(url)}</p>
  <p style="font-size:13px;color:#71717a">Se você não pediu este e-mail, ignore-o.</p>
</div>`;
  return { subject, html, text };
}
