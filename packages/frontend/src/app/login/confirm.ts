import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { IconComponent } from '../components/icon.component';
import { AuthService } from '../services/auth.service';
import { apiErrorMessage } from '../services/subtitle.service';

/**
 * Target of the e-mailed link. The token is exchanged with a POST from the page, so link
 * scanners that only fetch the URL (common in corporate e-mail) cannot use it up.
 */
@Component({
  selector: 'app-login-confirm',
  standalone: true,
  imports: [RouterLink, IconComponent],
  template: `
    <div class="card box">
      @if (error()) {
        <div class="alert danger" role="alert"><app-icon name="alert" /><div class="alert-body">{{ error() }}</div></div>
        <a class="btn primary" routerLink="/entrar">Pedir um novo link</a>
      } @else {
        <span class="spinner lg"></span>
        <p>Entrando…</p>
      }
    </div>
  `,
  styles: [
    `
      .box {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
        max-width: 420px;
        margin: 3rem auto;
        padding: 2rem;
        text-align: center;
      }
    `,
  ],
})
export class LoginConfirmComponent implements OnInit {
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token) {
      this.error.set('Link incompleto. Peça um novo link de acesso.');
      return;
    }
    try {
      await this.auth.verifyLink(token);
      this.router.navigateByUrl(this.auth.takeReturn(), { replaceUrl: true });
    } catch (err) {
      this.error.set(apiErrorMessage(err, 'Não foi possível entrar com este link.'));
    }
  }
}
