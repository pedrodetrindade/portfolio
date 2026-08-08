# Worker de contato

Recebe o formulário do painel de contato do site e envia o e-mail pelo
[Resend](https://resend.com). É público de propósito e **não** compartilha
código nem credencial com o Worker do painel administrativo (`../worker`), que
fica atrás do Cloudflare Access. Aqui não existe token do GitHub e não existe
escrita no repositório: o pior caso de abuso é consumo de cota do Resend.

O destinatário nunca vem do pedido — é a variável `MAIL_TO`. Se viesse do corpo
da requisição, o endpoint viraria um relay aberto e qualquer um poderia mandar
e-mail com o seu domínio no remetente.

## Colocar no ar (uma vez)

> **Use `npm.cmd`, e não `npm`, no PowerShell do Windows.** A política de
> execução padrão é `Restricted` e bloqueia todo `.ps1` — inclusive os atalhos
> `npm.ps1` e `npx.ps1` que o Node instala. O erro é "a execução de scripts foi
> desabilitada neste sistema". Chamar o `.cmd` explicitamente resolve sem
> precisar afrouxar a política da máquina. No Git Bash, `npm` normal funciona.

### 1. Conta no Resend e verificação do domínio

1. Crie a conta em [resend.com](https://resend.com) (o plano gratuito cobre
   3.000 e-mails/mês, 100/dia — muito acima do volume de um portfólio).
2. Vá em **Domains → Add Domain** e informe `pedrodetrindade.com`.
3. O Resend mostra alguns registros DNS (DKIM, SPF e, opcionalmente, DMARC).
   Como o domínio já está na Cloudflare, é só criá-los em
   **DNS → Records** no painel da Cloudflare, copiando exatamente os valores.
   Deixe esses registros **sem proxy** (nuvem cinza) — são de e-mail, não de HTTP.
4. Espere o domínio ficar `Verified` no Resend (costuma levar poucos minutos).

> Sem essa verificação, o Resend recusa o envio: ele não deixa nenhuma conta
> mandar e-mail dizendo ser de um domínio que não provou controlar. É essa
> mesma regra que impede outra pessoa de mandar e-mail se passando por você.

### 2. Chave da API

No Resend, **API Keys → Create API Key**, com permissão de envio. Copie a chave
(ela só aparece uma vez) e registre como Secret do Worker:

```bash
npm.cmd --prefix worker-contact run secret
```

O comando pergunta a chave no terminal e você cola ali. Ela fica criptografada
na Cloudflare, e **não** vai para o `wrangler.toml` nem para o Git.

### 3. Deploy

```bash
npm.cmd --prefix worker-contact run deploy
```

Na primeira vez, o Wrangler pede para autorizar a conta Cloudflare no
navegador. Se ainda não tiver feito isso:

```bash
npm.cmd --prefix worker-contact exec wrangler login
```

O deploy cria o Worker `portfolio-contact` e registra a rota
`pedrodetrindade.com/api/contact`. O resto do site continua servido pelo GitHub
Pages normalmente: a rota intercepta só esse caminho.

### 4. Conferir

Envie uma mensagem pelo formulário do site e veja se ela chega em
`contact@pedrodetrindade.com`. Para acompanhar o que o Worker está fazendo:

```bash
npm.cmd --prefix worker-contact run tail
```

## Desenvolvimento local

```bash
npm.cmd --prefix worker-contact run dev
```

Sobe na porta **8788**. O `js/main.js` do site aponta para
`http://localhost:8788/api/contact` automaticamente quando roda em `localhost`
— em produção o caminho é relativo e a chamada é same-origin.

Copie `.dev.vars.example` para `.dev.vars` e ajuste. Com uma chave falsa, o
envio falha com 502, que é justamente o caminho de erro que vale testar: a
interface mostra a mensagem alternativa e mantém o texto digitado.

## Proteção contra spam

Hoje existem três filtros, todos baratos:

- **Armadilha** (`website`): campo invisível que só robô preenche. Quando vem
  preenchido, a resposta é 200 e nada é enviado — dizer "recusado" ensinaria o
  robô a contornar.
- **Tempo de preenchimento**: envio em menos de 3 segundos é descartado do
  mesmo jeito silencioso.
- **Lista de origens** (`ALLOWED_ORIGINS`): recusa envio disparado de outro
  site. É higiene, não barreira forte — cabeçalho `Origin` é falsificável fora
  do navegador.

Se spam de verdade começar a passar, a resposta é o
[Turnstile](https://developers.cloudflare.com/turnstile/) da Cloudflare
(gratuito, e na maioria das vezes invisível para quem é gente). Isso exige um
widget no formulário e a verificação do token aqui — não foi feito agora
porque acrescenta peça em produção antes de existir o problema.
