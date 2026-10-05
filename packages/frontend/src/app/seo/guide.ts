import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { GUIDES, GuidePage } from './pages';

/** A public guide page (SEO): explanation, steps, details, FAQ and a call to action. */
@Component({
  selector: 'app-guide',
  standalone: true,
  imports: [RouterLink],
  styleUrl: '../legal/legal.scss',
  template: `
    <article>
      <h1>{{ page.h1 }}</h1>
      @for (p of page.intro; track $index) {
        <p class="lead">{{ p }}</p>
      }

      <h2>Passo a passo</h2>
      <ol class="steps">
        @for (s of page.steps; track $index) {
          <li><strong>{{ s.title }}.</strong> {{ s.text }}</li>
        }
      </ol>

      <div class="cta card">
        <p>Traduza sua primeira legenda agora: as 3 primeiras do mês são grátis.</p>
        <a class="btn primary" routerLink="/app">{{ auth.me() ? 'Traduzir uma legenda' : 'Começar grátis' }}</a>
      </div>

      @for (sec of page.sections; track $index) {
        <h2>{{ sec.title }}</h2>
        @for (p of sec.paragraphs; track $index) {
          <p>{{ p }}</p>
        }
      }

      <h2>Perguntas frequentes</h2>
      @for (f of page.faq; track $index) {
        <h3>{{ f.q }}</h3>
        <p>{{ f.a }}</p>
      }

      <h2>Veja também</h2>
      <ul>
        @for (g of others; track g.path) {
          <li><a [routerLink]="'/' + g.path">{{ g.h1 }}</a></li>
        }
        <li><a routerLink="/precos">Planos e preços</a></li>
      </ul>
    </article>
  `,
  styles: [
    `
      .lead {
        margin-top: 0.75rem;
        font-size: 1.02rem;
      }
      h1 {
        margin-bottom: 0.5rem;
      }
      h3 {
        margin: 1.1rem 0 0.3rem;
        font-size: 0.98rem;
      }
      .steps li {
        margin-top: 0.5rem;
      }
      .cta {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        margin: 2rem 0 0.5rem;
        padding: 1.1rem 1.25rem;
        box-shadow: none;
      }
      .cta p {
        margin: 0;
        color: var(--text);
        font-weight: 500;
      }
    `,
  ],
})
export class GuideComponent {
  protected auth = inject(AuthService);
  protected page: GuidePage = inject(ActivatedRoute).snapshot.data['guide'];
  protected others = GUIDES.filter(g => g !== this.page);
}
