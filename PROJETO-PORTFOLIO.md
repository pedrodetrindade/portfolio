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

## Direção visual (referências: Mercury + midu.design)
Técnico, clean, elegante, maduro. Baixo contraste.
- Fundo: carvão-azulado profundo e dessaturado (não preto puro).
- Texturas-assinatura: orbes/esferas de luz difusas, grain, vidro fosco (blur/translucidez).
- Sobreposições (selos, botões flutuantes, tags) sempre translúcidas, nunca creme sólido.
- Tipografia: Onest (display/corpo) + JetBrains Mono (rótulos técnicos, sempre minúsculos).

Tokens principais (ver `:root` em css/style.css):
ink #0A0C11 · ink-2 #12151D · paper #E7E9F0 · cream #EAE1CC · accent #AEBAD0 · muted #787E8D

## Estrutura atual
1. Portal de idioma na entrada (PT/EN), a cada carregamento.
2. Topo: marca à esquerda, botão "Menu" centralizado, seletor PT/EN e CTA "Contato"
   à direita. A nav é uma grade de três colunas para o Menu ficar no centro exato.
3. Capa: título centralizado, glow monocromático subindo do rodapé, barra com cargo,
   relógio ao vivo do Rio e "role para explorar", wordmark gigante em marca-d'água.
4. Sobre: faixa full-bleed em cinza claro quebrando o fundo escuro, com retrato à
   esquerda e bio à direita. Dentro da faixa o texto inverte para tom escuro.
5. Trabalhos: 4 cards grandes com tags translúcidas no topo e título sobreposto na base.
6. Ferramentas: grade de cards.
7. Contato: título, CTA em pill, links de e-mail, LinkedIn e Behance. Footer.

A seção de experiência foi removida do site. Essa informação vive apenas no LinkedIn
e no currículo.

Bilíngue via atributos `data-pt` / `data-en` em cada elemento traduzível.
Todo texto novo precisa dos dois atributos.

## Interações
- Menu overlay em vidro fosco com miniaturas e redes (LinkedIn e Behance).
- CTA "Contato" fica no topo, ao lado do menu, e abre o painel de contato.
- Painel de contato: nome, e-mail e mensagem apenas. Sem campos de orçamento ou escopo.
- Transições entre páginas: véu escurece, navega, a próxima entra em fade.
- Entrada das seções: fade e subida suave, escalonadas em 90ms entre os elementos que
  aparecem juntos na tela.
- Scrub de leitura: nos parágrafos do Sobre e dos cases as palavras clareiam conforme
  cruzam 72% da altura da tela. O JS quebra o texto em spans e precisa reconstruí-los
  a cada troca de idioma, porque a tradução reescreve o `innerHTML`.
- Glow suave seguindo o cursor pelo site.
- Selo translúcido "ver caso" acompanhando o mouse sobre os cards de projeto.

Tudo respeita `prefers-reduced-motion` e é desativado em telas touch quando faz sentido.
Atenção ao testar: navegadores headless, incluindo o painel de preview do Claude Code,
reportam `prefers-reduced-motion: reduce` por padrão, então as animações não aparecem
ali. Para ver o movimento, abra o `index.html` no navegador normal.

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
