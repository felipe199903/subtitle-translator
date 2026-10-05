import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-faq',
  standalone: true,
  imports: [RouterLink],
  template: `
    <h2>Perguntas frequentes</h2>
    <details class="card">
      <summary>Quais arquivos posso traduzir?</summary>
      <p>Legendas <code>.srt</code> de até 4 MB, normalmente em inglês. Os tempos, o itálico, os diálogos e os acentos são mantidos, e você baixa um <code>.pt-BR.srt</code> pronto para qualquer player ou TV.</p>
    </details>
    <details class="card">
      <summary>A tradução é feita por uma pessoa?</summary>
      <p>Não. É tradução automática, com marcações nas falas que merecem revisão. Você corrige direto na lista antes de baixar, e suas correções são lembradas nas próximas traduções.</p>
    </details>
    @if (auth.aiEngine()) {
      <details class="card">
        <summary>Qual a diferença da tradução do Pro?</summary>
        <p>O Pro traduz com inteligência artificial (Google Gemini), que lê as falas vizinhas para acertar gênero, tratamento (você/senhor), gírias e piadas. O plano grátis usa tradução automática comum, frase a frase. Em ambos você revisa e corrige antes de baixar.</p>
      </details>
    }
    <details class="card">
      <summary>Posso pagar com Pix?</summary>
      <p>Sim, no Pro avulso (30 dias ou 12 meses). A assinatura mensal é cobrada no cartão de crédito, com renovação automática.</p>
    </details>
    <details class="card">
      <summary>Como cancelo a assinatura?</summary>
      <p>Em <a routerLink="/conta">Minha conta</a> → Gerenciar assinatura. O Pro continua ativo até o fim do período já pago e não há multa nem fidelidade.</p>
    </details>
    <details class="card">
      <summary>E se eu me arrepender?</summary>
      <p>Você pode pedir o reembolso integral em até 7 dias após a compra, pelo e-mail de contato. Veja os <a routerLink="/termos">Termos de Uso</a>.</p>
    </details>
    <details class="card">
      <summary>O que acontece com meus arquivos?</summary>
      <p>Eles ficam guardados só para você revisar e baixar, e são apagados automaticamente após 7 dias sem uso. Detalhes na <a routerLink="/privacidade">Política de Privacidade</a>.</p>
    </details>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
      }
      h2 {
        margin-bottom: 0.5rem;
        font-size: 1.35rem;
        text-align: center;
      }
      details {
        padding: 0.9rem 1.1rem;
        box-shadow: none;
      }
      summary {
        font-weight: 600;
        cursor: pointer;
      }
      p {
        margin-top: 0.6rem;
        color: var(--text-muted);
        font-size: 0.92rem;
      }
      code {
        font-family: var(--mono);
        font-size: 0.88em;
      }
    `,
  ],
})
export class FaqComponent {
  protected auth = inject(AuthService);
}
