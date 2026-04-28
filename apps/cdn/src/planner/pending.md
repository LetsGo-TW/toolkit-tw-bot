# Resolver quando houver mais de 1000 vilas no grupo;
  * por hora mantendo as 1000 vilas mais próximas✔️
# Incluir attackName em opcoes de envio/agendamento;
# Avaliar duration:
  1. BN OK;
  2. Bonus de velocidade precisa fazer
  2.1 modo enviar: envia e relata que existe bonus;✔️
  2.2 modo agendar (no envio): reagendar ou abortar de acordo com a opção do jogador;

# Incluir filtros e order no perfil de jogador  para facilitar a coleta de coords;

# EXTRA PLANNER: Melhorar General/Search-Full-Storage.js(SNOB MINT) para buscar quando encher a villa com a maior bandeira e atualizar liberando a execução e fazer o request em outras vilas atualizando em segundo plano. Nota: Cuidar para parar o request se executar novamente o MINT.✔️

# Refactor planner/view (pós deploy):
  1. `planner/view/index.js`: manter somente montagem de UI e wiring.
  2. `planner/application/*`: mover fluxos de execução (send, schedule, distribution).
  3. `planner/domain/*`: mover regras/cálculos puros.
  4. `planner/infra/*`: mover requests/storage/runtime.
