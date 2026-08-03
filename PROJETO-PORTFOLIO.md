# Portfólio — Pedro de Trindade

Brief de projeto para continuar o desenvolvimento no Claude Code.
Leia este brief antes de editar.

## Objetivo
Site de portfólio pessoal, codado, hospedado no GitHub Pages com domínio próprio.
Posicionamento: diretor de arte e designer sênior, com foco em direção criativa,
branding, identidade visual, campanhas e estratégia de marca para fintech,
ativos digitais e negócios B2B e B2C.

## Identidade
- Nome público: Pedro de Trindade
- Handle (todas as redes): @pedrodetrindade
- Domínio: pedrodetrindade.com
- E-mail: contact@pedrodetrindade.com (e contato@, ambos encaminham para o Gmail)

## Stack
Site estático: HTML + CSS + JS puro, sem framework e sem build.
Deploy no GitHub Pages. O objetivo é controle total do design e zero custo além do domínio.

## Arquivos
```
index.html          home (capa, trabalhos, sobre, ferramentas, experiência, contato)
css/style.css       todo o CSS do site
js/main.js          todo o JS; injeta menu, painel de contato e transições em todas as páginas
work/case-01..04    páginas de case, bilíngues, mesmo sistema visual
assets/             favicon, ícone Apple e imagem Open Graph. Faltam as imagens dos projetos
CNAME               pedrodetrindade.com
```

CSS e JS são compartilhados pelas 5 páginas. Os links usam `?v=N` para furar o cache
do navegador: ao editar `css/style.css` ou `js/main.js`, incremente esse número em
todas as páginas, senão o navegador continua servindo a versão antiga.

## Direção visual
Escura, monocromática, levemente quente e puxada para marrom. Clean, editorial,
baixo contraste, sem peso tipográfico exagerado.
- Fundo: quase preto quente, não preto puro.
- Texturas: grain e massas de luz muito discretas. Nenhum filter:blur() no site.
- Tipografia: Onest (display/corpo, teto de peso 600) + JetBrains Mono (rótulos).
- Tracking baixo: teto de .06em, e só em rótulo curto.

Tokens principais (ver `:root` em css/style.css):
ink #0D0A0A · ink-2 #261B1D · ink-3 #403638 · paper #F2EEEE · muted #B7ACAC ·
muted-2 #8A7E7E · accent #A29595 · cream #C9BDBD

## Estrutura atual
1. Intro: assinatura curta com "Pedro de Trindade.", só na primeira visita da
   sessão (sessionStorage). Sem porcentagem falsa e sem spinner. A hero acende
   antes de a intro terminar.
2. Topo: marca à esquerda, "Menu" centralizado, PT/EN e CTA "Contato" à direita.
3. Hero: o nome ocupa a primeira viewport, em duas linhas mascaradas, peso 600.
   Sem frase de impacto. Em volta ficam a tag profissional, o carimbo de data e
   hora do Brasil e "role para explorar".
4. Trabalhos: 4 cards grandes.
5. Sobre: retrato à esquerda, headline, parágrafo, grade de capacidades e CTA
   à direita. Faixa com elevação mínima de tom, sem fundo claro.
6. Como eu consigo te ajudar: três frentes numeradas, com linha que cresce.
7. Números: três dados verificáveis, com count-up uma única vez.
8. Contato: headline grande em duas linhas, e-mail copiável e redes. Footer.

A seção de experiência foi removida do site: essa informação vive só no LinkedIn
e no currículo. A de ferramentas saiu na revisão estrutural, por sobrepor as
capacidades do Sobre.

**Números só com dado verificável.** Hoje são seis anos de prática (desde 2020),
quatro casos selecionados e 120+ países alcançados pela marca cujo rebranding o
Pedro liderou. Marcas atendidas, lançamentos e mercados seguem pendentes de
confirmação e estão comentados no HTML, não inventados.

Bilíngue via atributos `data-pt` / `data-en` em cada elemento traduzível.
Todo texto novo precisa dos dois atributos.

## Interações
- Menu overlay em vidro fosco com miniaturas e redes (LinkedIn e Behance).
- CTA "Contato" fica no topo, ao lado do menu, e abre o painel de contato.
- Painel de contato: nome, e-mail e mensagem apenas. Sem campos de orçamento ou escopo.
- Transições entre páginas: véu escurece, navega, a próxima entra em fade.
- Entrada das seções: 24px e opacidade em 650ms, escalonadas em 70ms com teto de
  seis passos, disparando assim que o elemento encosta na viewport.
- Scroll por inércia na roda do mouse. O midu.design usa Lenis (lerp .1); aqui é
  escrito à mão, com decaimento por tempo para não acelerar em telas de 120Hz.
  Toque, teclado, âncoras e barra de rolagem seguem nativos, e o alvo resincroniza
  quando a rolagem vem de outra origem. Não age com overlay aberto.
- Scrub de leitura: nos parágrafos do Sobre e dos cases as palavras clareiam conforme
  cruzam 72% da altura da tela. O JS quebra o texto em spans e precisa reconstruí-los
  a cada troca de idioma, porque a tradução reescreve o `innerHTML`.
- Glow suave seguindo o cursor pelo site.
- Selo translúcido "ver caso" acompanhando o mouse sobre os cards de projeto.

Sob `prefers-reduced-motion` o conteúdo aparece imediatamente, sem deslocamento e sem
scroll por inércia. Efeitos que dependem de cursor são desligados em telas touch.

Atenção ao testar: navegadores headless, incluindo o painel de preview do Claude Code,
reportam `prefers-reduced-motion: reduce` por padrão. No Windows, o mesmo acontece se
"Efeitos de animação" estiver desligado em Configurações > Acessibilidade > Efeitos
visuais. Nesses casos só os fades aparecem, e é o comportamento esperado.

## Próximos passos
1. Trocar as prévias placeholder por imagens reais dos projetos.
   Cada prévia é uma `<div class="scene pX"></div>`.
   Substituir por: `<img src="assets/case-01.jpg" class="scene" alt="...">`
   (mesmo enquadramento, grain e hover continuam funcionando).
2. Colocar o retrato real no Sobre. Hoje é um placeholder `.portrait` com um selo
   escrito "foto". Substituir por:
   `<img src="assets/pedro.jpg" class="portrait-img" alt="Pedro de Trindade">`
3. Curadoria: escrever o conteúdo real de cada case (contexto, processo, resultado).
   Hoje é texto placeholder genérico. Elevar a nível de direção criativa sênior.
4. Deploy: o repositório já existe em github.com/pedrodetrindade/portfolio.
   Falta enviar os arquivos, ligar o Pages e apontar o DNS.
5. Confirmar as URLs de LinkedIn e Behance (hoje assumem /pedrodetrindade).
6. Decidir o envio do formulário: hoje abre o cliente de e-mail via `mailto:`.
   Para envio real sem sair do site, usar um serviço como Formspree (tem plano grátis).
7. Acabamento restante: performance e revisão final de acessibilidade.
   Favicon, Open Graph, foco visível, skip link e `aria-label` bilíngue já estão feitos.

## Deploy no GitHub Pages (resumo)
- Criar conta no GitHub e um repositório público (ex.: `pedrodetrindade`).
  Pages em repositório privado exige plano pago, então use público.
- Enviar os arquivos, mantendo o `CNAME` na raiz com apenas: pedrodetrindade.com
- Em Settings > Pages, apontar para a branch principal.
- No DNS do domínio (Porkbun): registros A do domínio apex apontando para os IPs do
  GitHub Pages e um CNAME `www` para `SEU-USUARIO.github.io`.
  Confirmar os IPs atuais na documentação do GitHub Pages antes de configurar.
- Ativar "Enforce HTTPS" após a propagação.

## Preferências de escrita
Sem travessões (—) no corpo do texto. Sem caixa alta em texto corrido.
Registro premium, claro e estratégico. Evitar tom que soe gerado por IA.
