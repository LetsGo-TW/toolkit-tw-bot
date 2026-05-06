# alives e no alives targets

1: INCLUSÃO - busca em plunderList (target, report_id) relatórios com info de tropas (blue, red_blue, yellow_blue):
  - verifica a lista de no-alive-targets e alive-targets e se não estiver na lista irá buscar a informação de tropas desses relatórios:
    - sem tropas salva em no-alive-targets (array de targets)
    - com tropas salva em alive-targets (array de { target, units[] })
2: EXCLUSÃO - busca em plunderList (target, report_id) relatórios (amarelo, verde)
  - exclui de 'no-alives-targets' e 'alives-targets' todos os targets que estiverem nessa lista


# target sent é para controlar somente o quebra muralha
