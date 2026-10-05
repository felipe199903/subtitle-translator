import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { COMPANY } from './company';

@Component({
  selector: 'app-privacy',
  standalone: true,
  imports: [RouterLink],
  styleUrl: './legal.scss',
  template: `
    <h1>Política de Privacidade</h1>
    <p class="updated">Última atualização: {{ c.updatedAt }}</p>

    <p>
      Esta política explica como o {{ c.product }} ({{ c.site }}) trata dados pessoais, de acordo com a Lei Geral de
      Proteção de Dados (Lei 13.709/2018, LGPD).
      @if (c.holder) { O controlador dos dados é <strong>{{ c.holder }}</strong>@if (c.document) {, {{ c.document }}}. }
      Contato do encarregado: <a [href]="'mailto:' + c.email">{{ c.email }}</a>.
    </p>

    <h2>1. Dados que tratamos</h2>
    <ul>
      <li><strong>Conta:</strong> e-mail, nome e o identificador da conta Google, se você entrar com o Google.</li>
      <li><strong>Legendas:</strong> os arquivos <code>.srt</code> enviados, as traduções e as correções que você faz.</li>
      <li><strong>Uso:</strong> quantas legendas você traduziu em cada mês, para aplicar os limites do plano.</li>
      <li>
        <strong>Pagamento:</strong> plano, situação da assinatura e o identificador de cliente no Stripe. Os dados do cartão
        e do Pix ficam só com o Stripe.
      </li>
      <li><strong>Técnicos:</strong> endereço IP e registros de acesso mantidos pela hospedagem, por segurança.</li>
    </ul>

    <h2>2. Para que usamos e com qual base legal</h2>
    <ul>
      <li>Prestar o serviço, manter sua conta e aplicar o seu plano: execução de contrato (art. 7º, V).</li>
      <li>Cobrança e registros fiscais: cumprimento de obrigação legal (art. 7º, II).</li>
      <li>Segurança e prevenção de abuso e fraude: legítimo interesse (art. 7º, IX).</li>
    </ul>
    <p>Não vendemos dados pessoais e não usamos seus dados para publicidade.</p>

    <h2>3. Memória de tradução</h2>
    <p>
      Para melhorar a qualidade, as frases traduzidas e as correções feitas pelos usuários alimentam uma memória de
      tradução reaproveitada nas próximas traduções do serviço. Essa memória guarda apenas pares de frases (original e
      tradução), sem ligação com a sua conta.
    </p>

    <h2>4. Com quem compartilhamos</h2>
    <p>Usamos fornecedores que tratam dados em nosso nome, alguns fora do Brasil (art. 33 da LGPD):</p>
    <ul>
      <li><strong>Vercel</strong> (hospedagem e estatísticas de acesso anônimas) e <strong>Neon</strong> (banco de dados), nos EUA.</li>
      <li><strong>Stripe</strong> (pagamentos).</li>
      <li><strong>Google</strong> (login com Google) e <strong>Resend</strong> (envio do e-mail de acesso).</li>
      <li>
        <strong>Serviços de tradução</strong> (Google Tradutor e MyMemory no plano grátis; Google Gemini, pela API paga, no
        Pro), que recebem o texto das falas a traduzir, sem dados da sua conta.
      </li>
    </ul>

    <h2>5. Por quanto tempo guardamos</h2>
    <ul>
      <li>Legendas e traduções: apagadas automaticamente 7 dias após o último acesso.</li>
      <li>Conta e contagem de uso: enquanto a conta existir.</li>
      <li>Links de acesso por e-mail: expiram em 15 minutos e são apagados em até 1 dia.</li>
      <li>Registros de pagamento: pelo prazo exigido pela legislação fiscal, no Stripe.</li>
    </ul>

    <h2>6. Cookies</h2>
    <p>
      Usamos um único cookie essencial (<code>st_session</code>) para manter você conectado, e guardamos no navegador a
      sua preferência de tema claro ou escuro. Não usamos cookies de publicidade nem de análise: as estatísticas de acesso
      (Vercel Web Analytics) são agregadas e anônimas, sem cookies e sem identificar você. Na página de login, o
      botão do Google pode usar cookies próprios do Google.
    </p>

    <h2>7. Seus direitos</h2>
    <p>
      Você pode pedir acesso, correção, portabilidade ou exclusão dos seus dados, além de informações sobre o
      compartilhamento (art. 18 da LGPD). Para excluir a conta e todos os dados dela, use
      <a routerLink="/conta">Minha conta</a> → Excluir minha conta. Para os demais pedidos, escreva para
      <a [href]="'mailto:' + c.email">{{ c.email }}</a>. Você também pode reclamar à ANPD.
    </p>

    <h2>8. Segurança</h2>
    <p>
      O site usa HTTPS, a sessão fica em um cookie protegido (HttpOnly) e cada pessoa só acessa as próprias legendas.
      Nenhum sistema é totalmente imune a falhas: se houver um incidente relevante, avisaremos você e a ANPD.
    </p>

    <h2>9. Alterações</h2>
    <p>Mudanças relevantes nesta política serão avisadas no site ou por e-mail.</p>
  `,
})
export class PrivacyComponent {
  protected c = COMPANY;
}
