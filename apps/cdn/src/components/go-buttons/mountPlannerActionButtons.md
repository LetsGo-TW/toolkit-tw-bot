# `mountPlannerActionButtons`

Documento de comportamento e diferenças por contexto para os botões de ação do planner (`Agendar`, `Enviar` e, quando aplicável, `Draft`).

## Objetivo

Centralizar a UX dos botões de entrada do planner em um ponto comum, com variações por contexto, mantendo visual e comportamento consistentes.

## Contextos

### 1. `planner` (popup do planner)

No contexto do planner, os botões funcionam como **seletor de modo** interno.

- Alterna entre os modos:
  - `send`
  - `schedule`
- Não abre o planner (ele já está aberto)
- Não mostra botão de `draft` (por enquanto)

Resumo:
- comportamento = **seletor de modo**
- `draft` = **não aparece**

### 2. Demais contextos (ex.: `info_village`, Coletor, outros)

Fora do planner, os botões funcionam como **entrada para abrir o planner**.

- `Agendar` abre o planner em `mode=schedule`
- `Enviar` abre o planner em `mode=send`
- payload pode incluir:
  - `target` (obrigatório para abrir)
  - `targets` (lista, quando existir)

Observação:
- `place` ainda não está completo porque a abertura depende de `target`, e a tela nem sempre possui `target` resolvido no momento.

Resumo:
- comportamento = **abrir planner**
- passa `mode`, `target` e `targets` (quando houver)

### 3. Botão `Draft` (lista de targets salva)

Quando existir **lista de targets salva (draft)**, o botão `Draft` deve aparecer em **qualquer contexto**, exceto no `planner`.

- Visível somente se existir rascunho com lista (`> 1 target`)
- Ícone do botão deve refletir o modo salvo no draft:
  - `schedule` -> calendário
  - `send` -> espadas
- Tooltip com branding do LetsGO + texto de contexto
  - Ex.: `Últimos alvos salvos`

Ações no dropdown (clique no botão):
- `Recuperar`
- `Excluir`

Resumo:
- `draft` aparece fora do planner quando houver lista salva
- `planner` não exibe `draft` (seletor de modo apenas)

### 4. Lista atual + Draft (caso de conflito / composição)

Quando houver **lista de targets atual** no contexto (por enquanto: Coletor), além do draft salvo:

- o dropdown do `Draft` também mostra:
  - `Mesclar`

Além disso:
- os botões `Agendar` e `Enviar` devem pedir confirmação **antes de abrir** o planner, se houver risco de perder o draft anterior (fluxo de conflito)

Objetivo:
- evitar perda silenciosa de rascunho
- permitir reaproveitar lista anterior com `Mesclar`

## Regras de UX (resumo)

- Visual dos botões deve ser o mesmo componente base de ações do planner
- Variação por contexto deve ser feita por configuração (e não por duplicação de UI)
- `Draft` é contextual:
  - aparece fora do planner
  - não aparece no planner (modo seletor)

## Estado atual / direção arquitetural

Direção correta:
- `mountPlannerActionButtons` = ponto de montagem por contexto
- `createInlinePlannerActionButtons` = UI compartilhada (botões)
- `targets-draft` (`core` + `button`) = regra + UI isoladas do rascunho

Próximo passo esperado:
- integrar o botão `Draft` no fluxo compartilhado de botões (em vez de integração ad-hoc por contexto)
- usar configuração por contexto (`planner`, `collector`, `info_village`, etc.)
