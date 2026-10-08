import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { COMPANY } from './company';

@Component({
  selector: 'app-terms',
  standalone: true,
  imports: [RouterLink],
  styleUrl: './legal.scss',
  template: `
    <h1>Termos de Uso</h1>
    <p class="updated">Última atualização: {{ c.updatedAt }}</p>

    <h2>1. O serviço</h2>
    <p>
      O {{ c.product }} ({{ c.site }}) traduz automaticamente arquivos de legenda <code>.srt</code> e permite revisar e
      baixar o resultado.
      @if (c.holder) { O serviço é oferecido por <strong>{{ c.holder }}</strong>@if (c.document) {, {{ c.document }}}. }
      Ao criar uma conta ou usar o serviço, você concorda com estes termos.
    </p>

    <h2>2. Conta</h2>
    <p>
      Você entra com uma conta Google ou com um link enviado ao seu e-mail. Mantenha o acesso ao seu e-mail seguro: quem
      controla o e-mail controla a conta. Você deve ter pelo menos 18 anos, ou a autorização dos seus responsáveis.
    </p>

    <h2>3. Planos e pagamento</h2>
    <ul>
      <li><strong>Grátis:</strong> 3 legendas por mês, com arquivos de até 1.500 falas.</li>
      <li>
        <strong>Pro Mensal:</strong> assinatura cobrada no cartão de crédito a cada mês, renovada automaticamente até
        você cancelar.
      </li>
      <li>
        <strong>Pro avulso (30 dias ou 12 meses):</strong> pagamento único no cartão ou, quando disponível no pagamento, com Pix, sem renovação automática.
        Novas compras somam os dias ao período que você já tem.
      </li>
    </ul>
    <p>
      O Pro tem uso justo de até 200 legendas por mês e arquivos de até 10.000 falas. Os preços estão na página de
      <a routerLink="/precos">planos</a> e incluem os tributos aplicáveis. Os pagamentos são processados pelo Stripe; não
      guardamos dados de cartão. Se mudarmos o preço da assinatura, avisaremos por e-mail com pelo menos 30 dias de
      antecedência, e a mudança só vale a partir da renovação seguinte.
    </p>

    <h2>4. Cancelamento e reembolso</h2>
    <p>
      Você pode cancelar a assinatura a qualquer momento em <a routerLink="/conta">Minha conta</a> → Gerenciar
      pagamentos. O Pro continua até o fim do período já pago, e não há multa nem fidelidade.
    </p>
    <p>
      Conforme o art. 49 do Código de Defesa do Consumidor, você pode desistir de qualquer compra em até
      <strong>7 dias</strong> e receber o valor integral de volta, escrevendo para <a [href]="'mailto:' + c.email">{{ c.email }}</a>.
      Depois desse prazo, não há reembolso proporcional do período em curso, salvo em caso de falha do serviço.
    </p>

    <h2>5. Seu conteúdo</h2>
    <p>
      Você continua responsável pelos arquivos que envia e declara ter o direito de usá-los. Não envie conteúdo ilegal
      nem use o serviço para infringir direitos autorais. Precisamos processar o texto das legendas para traduzi-lo, como
      descrito na <a routerLink="/privacidade">Política de Privacidade</a>.
    </p>

    <h2>6. Uso aceitável</h2>
    <p>
      É proibido automatizar o uso para contornar limites, revender o serviço, tentar acessar dados de outras pessoas ou
      prejudicar o funcionamento do site. Podemos suspender contas que violem estes termos, com aviso, sempre que
      possível.
    </p>

    <h2>7. Qualidade da tradução</h2>
    <p>
      A tradução é automática e pode conter erros. O site marca as falas que merecem atenção, mas a revisão final é sua.
      O serviço é fornecido como está, sem garantia de que a tradução atende a uma finalidade específica.
    </p>

    <h2>8. Disponibilidade e responsabilidade</h2>
    <p>
      Fazemos o possível para manter o serviço no ar, mas podem ocorrer interrupções para manutenção ou por falhas de
      terceiros. Na medida permitida pela lei, nossa responsabilidade se limita ao valor pago por você nos últimos 12
      meses. Nada aqui afasta os direitos garantidos pelo Código de Defesa do Consumidor.
    </p>

    <h2>9. Alterações</h2>
    <p>
      Podemos atualizar estes termos. Mudanças relevantes serão avisadas no site ou por e-mail antes de entrarem em
      vigor.
    </p>

    <h2>10. Lei e foro</h2>
    <p>Estes termos seguem a lei brasileira. Fica eleito o foro do domicílio do consumidor.</p>

    <h2>11. Contato</h2>
    <p>Dúvidas, suporte ou reembolsos: <a [href]="'mailto:' + c.email">{{ c.email }}</a>.</p>
  `,
})
export class TermsComponent {
  protected c = COMPANY;
}
