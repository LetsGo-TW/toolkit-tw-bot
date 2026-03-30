# Webpack Obfuscator Options

Este arquivo centraliza os níveis de ofuscação usados no projeto.

## Estrutura

O módulo exporta:

- `COMMON_OPTIONS`: opções comuns a todos os presets
- `PRESETS`: presets completos (`high`, `medium`, `low`, `default`, `defaultPlus`)
- `OVERRIDES`: ajustes parciais por contexto, como `extension`
- `getObfuscatorPreset(level)`: retorna um preset completo
- `getObfuscatorOverride(name)`: retorna um override parcial
- `getObfuscatorOptions(level, overrideNames)`: combina preset + overrides

---

## COMMON_OPTIONS

São opções compartilhadas por todos os níveis.

### compact
Compacta o código final.

### debugProtection
Tenta dificultar uso de ferramentas de debug.

### debugProtectionInterval
Intervalo usado com `debugProtection`.

### disableConsoleOutput
Desativa `console.*` no código ofuscado.

### identifierNamesGenerator
Define como os nomes ofuscados serão gerados.

### log
Desativa logs internos do obfuscador.

### selfDefending
Tenta dificultar alterações manuais no código ofuscado.

### simplify
Simplifica algumas estruturas antes da ofuscação.

### stringArray
Move strings para um array interno.

### stringArrayIndexShift
Altera os índices usados no array de strings.

### stringArrayRotate
Rotaciona o array de strings.

### stringArrayShuffle
Embaralha o array de strings.

### stringArrayWrappersChainedCalls
Encadeia wrappers do array de strings.

### unicodeEscapeSequence
Converte caracteres em unicode escaped.

---

## Presets

### high
Nível mais agressivo.

Usa:
- `controlFlowFlattening`
- `deadCodeInjection`
- `numbersToExpressions`
- `rc4` para strings
- wrappers mais pesados

Prós:
- maior dificuldade de leitura

Contras:
- bundle maior
- execução pode ficar mais lenta
- maior chance de quebrar código
- `debugProtection` foi mantido desligado porque pausava a execução ao abrir o DevTools

---

### medium
Nível intermediário forte.

Usa:
- `controlFlowFlattening`
- `deadCodeInjection`
- `base64`
- `splitStrings`
- wrappers médios

Prós:
- proteção boa
- menos agressivo que `high`

Contras:
- ainda pode aumentar bastante o bundle
- pode quebrar módulos sensíveis

---

### low
Nível leve.

Usa:
- array de strings
- rotação e shuffle
- sem flattening
- sem dead code injection

Prós:
- mais estável
- bundle menor
- bom para começar

Contras:
- proteção menor

---

### default
Preset equilibrado.

Usa:
- `splitStrings`
- `stringArrayCallsTransform`
- `transformObjectKeys`
- `renameGlobals`

Prós:
- bom equilíbrio entre proteção e estabilidade

Contras:
- mais forte que `low`, então pode precisar de teste em módulos mais sensíveis

---

### defaultPlus
Variação do `default`.

Ele reforça:
- `splitStrings`
- `stringArrayCallsTransform`
- `stringArrayThreshold`
- `stringArrayWrappersCount`
- `transformObjectKeys`

Prós:
- bom próximo passo após `default`

Contras:
- pode aumentar o bundle em relação ao `default`

---

## Overrides

### extension
Override para contexto de extensão.

Hoje adiciona:
- `rotateStringArray: true`

Observação:
esse override não é um preset completo. Ele deve ser usado combinado com um preset base.

Exemplo:

```js
getObfuscatorOptions('default', 'extension')
