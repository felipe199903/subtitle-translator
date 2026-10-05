import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../components/icon.component';
import { PricingCardsComponent } from '../pricing/pricing-cards';
import { FaqComponent } from '../pricing/faq';
import { PromoComponent } from '../pricing/promo';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterLink, IconComponent, PricingCardsComponent, FaqComponent, PromoComponent],
  template: `
    <section class="hero">
      <span class="badge accent"><app-icon name="sparkle" [size]="14" /> 3 legendas grátis por mês</span>
      <h1>Legendas em português, prontas em segundos</h1>
      <p class="lead">
        Envie o <code>.srt</code> em inglês, revise as falas marcadas e baixe a legenda em português do Brasil,
        com tempos, itálico e acentos preservados.
      </p>
      <div class="cta">
        <a class="btn primary lg" routerLink="/app">{{ auth.me() ? 'Traduzir uma legenda' : 'Começar grátis' }}</a>
        <a class="btn lg" routerLink="/precos">Ver planos</a>
      </div>
    </section>

    <ol class="steps">
      <li class="card">
        <span class="step-icon"><app-icon name="upload" /></span>
        <div><strong>Envie</strong><p>O arquivo é traduzido em lotes, com o progresso na tela.</p></div>
      </li>
      <li class="card">
        <span class="step-icon"><app-icon name="pencil" /></span>
        <div><strong>Revise</strong><p>Filtre as falas com aviso (linha longa, leitura rápida) e corrija na hora.</p></div>
      </li>
      <li class="card">
        <span class="step-icon"><app-icon name="download" /></span>
        <div><strong>Baixe</strong><p>Receba o <code>.pt-BR.srt</code> para Plex, Jellyfin, VLC ou a TV.</p></div>
      </li>
    </ol>

    <div class="keeps">
      <span class="keeps-title">Preservado na tradução</span>
      <span class="badge"><app-icon name="clock" [size]="14" /> Tempos</span>
      <span class="badge"><app-icon name="italic" [size]="14" /> Itálico</span>
      <span class="badge"><app-icon name="message" [size]="14" /> Diálogos</span>
      <span class="badge"><app-icon name="check" [size]="14" /> Acentos (UTF-8)</span>
      <span class="badge"><app-icon name="languages" [size]="14" /> Memória das suas correções</span>
    </div>

    <section class="section">
      <h2>Feito para quem assiste com legenda</h2>
      <div class="benefits">
        <div class="card benefit">
          <app-icon name="check" />
          <div>
            <strong>Acentos sempre certos</strong>
            <p>Arquivos em formatos antigos (Windows-1252) são convertidos para UTF-8: chega de "nÃ£o" no lugar de "não".</p>
          </div>
        </div>
        <div class="card benefit">
          <app-icon name="download" />
          <div>
            <strong>Pronto para o seu player</strong>
            <p>Funciona no Plex, Jellyfin, Kodi, VLC, Stremio e na TV: é só renomear junto com o vídeo.</p>
          </div>
        </div>
        <div class="card benefit">
          <app-icon name="pencil" />
          <div>
            <strong>Você no controle</strong>
            <p>Falas longas ou rápidas demais ficam marcadas para revisar. Suas correções são lembradas nas próximas legendas.</p>
          </div>
        </div>
      </div>
    </section>

    <section class="section narrow">
      <h2>Grátis ou Pro?</h2>
      <div class="card compare">
        <table>
          <thead>
            <tr><th></th><th>Grátis</th><th class="pro">Pro</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Motor de tradução</td>
              <td>Automática, frase a frase</td>
              <td class="pro">{{ auth.aiEngine() ? 'IA com contexto (Gemini)' : 'Automática, frase a frase' }}</td>
            </tr>
            <tr><td>Legendas por mês</td><td>3</td><td class="pro">até 200</td></tr>
            <tr><td>Tamanho do arquivo</td><td>até 1.500 falas</td><td class="pro">até 10.000 falas</td></tr>
            <tr><td>Revisão e memória de correções</td><td>✓</td><td class="pro">✓</td></tr>
            <tr><td>Pagamento</td><td>—</td><td class="pro">cartão (mensal) ou Pix (avulso)</td></tr>
          </tbody>
        </table>
      </div>
      @if (auth.aiEngine()) {
        <p class="compare-note">
          A IA lê as falas vizinhas antes de traduzir: acerta quem fala com quem, "você" ou "senhor", gírias, piadas e
          nomes de anime, em vez de traduzir cada linha isolada.
        </p>
      }
    </section>

    <section class="section" id="planos">
      <h2>Planos</h2>
      <app-promo class="promo" />
      <app-pricing-cards />
    </section>

    <section class="section narrow">
      <app-faq />
    </section>

    <section class="section final card">
      <h2>Sua próxima legenda em português está a um arquivo de distância</h2>
      <p>Crie a conta em segundos com o Google ou seu e-mail. As 3 primeiras legendas do mês são por nossa conta.</p>
      <a class="btn primary lg" routerLink="/app">{{ auth.me() ? 'Traduzir agora' : 'Começar grátis' }}</a>
    </section>
  `,
  styles: [
    `
      code {
        font-family: var(--mono);
        font-size: 0.88em;
        padding: 0.1em 0.35em;
        border-radius: 4px;
        background: var(--surface-2);
      }
      .hero {
        max-width: 760px;
        margin: 2rem auto 2.5rem;
        text-align: center;
      }
      .hero .badge {
        margin-bottom: 1rem;
      }
      h1 {
        font-size: clamp(1.9rem, 5vw, 2.8rem);
        font-weight: 700;
      }
      .lead {
        max-width: 580px;
        margin: 1rem auto 0;
        color: var(--text-muted);
        font-size: 1.05rem;
      }
      .cta {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 0.6rem;
        margin-top: 1.6rem;
      }
      .btn.lg {
        padding: 0.7rem 1.3rem;
        font-size: 1rem;
      }
      .steps {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 0.75rem;
        max-width: 900px;
        margin: 0 auto;
        padding: 0;
        list-style: none;
      }
      .steps li {
        display: flex;
        gap: 0.75rem;
        padding: 1rem;
        box-shadow: none;
      }
      .step-icon {
        display: grid;
        place-items: center;
        flex: none;
        width: 34px;
        height: 34px;
        border-radius: 9px;
        background: var(--accent-soft);
        color: var(--accent-text);
      }
      .steps strong {
        font-size: 0.95rem;
        font-weight: 600;
      }
      .steps p {
        margin-top: 0.15rem;
        color: var(--text-muted);
        font-size: 0.87rem;
        line-height: 1.45;
      }
      .keeps {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: center;
        gap: 0.4rem;
        margin-top: 1.75rem;
      }
      .keeps-title {
        margin-right: 0.25rem;
        color: var(--text-subtle);
        font-size: 0.8rem;
      }
      .section {
        margin-top: 4rem;
      }
      .section h2 {
        margin-bottom: 1.75rem;
        font-size: 1.5rem;
        text-align: center;
      }
      .narrow {
        max-width: 720px;
        margin-left: auto;
        margin-right: auto;
      }
      .benefits {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 0.75rem;
      }
      .benefit {
        display: flex;
        gap: 0.75rem;
        padding: 1.1rem;
        box-shadow: none;
      }
      .benefit app-icon {
        margin-top: 0.15rem;
        color: var(--accent-text);
      }
      .benefit strong {
        font-weight: 600;
      }
      .benefit p {
        margin-top: 0.25rem;
        color: var(--text-muted);
        font-size: 0.88rem;
      }
      .compare {
        overflow-x: auto;
        padding: 0.5rem 1rem;
        box-shadow: none;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.92rem;
      }
      th,
      td {
        padding: 0.7rem 0.5rem;
        border-bottom: 1px solid var(--border);
        text-align: left;
      }
      tr:last-child td {
        border-bottom: none;
      }
      td:first-child {
        color: var(--text-muted);
      }
      .pro {
        color: var(--accent-text);
        font-weight: 600;
      }
      .compare-note {
        margin-top: 0.9rem;
        color: var(--text-muted);
        font-size: 0.92rem;
        text-align: center;
      }
      .promo {
        display: block;
        margin-bottom: 1.75rem;
      }
      .final {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.9rem;
        padding: 2.5rem 1.5rem;
        text-align: center;
      }
      .final h2 {
        margin-bottom: 0;
      }
      .final p {
        max-width: 520px;
        color: var(--text-muted);
      }
      @media (max-width: 640px) {
        .hero {
          margin-top: 0.75rem;
        }
        .steps,
        .benefits {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class LandingComponent {
  protected auth = inject(AuthService);
}
