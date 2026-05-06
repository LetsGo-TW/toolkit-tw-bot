# Solução: Tratamento de 405 Method Not Allowed em farm-max

## 🔴 O Problema

Quando `farm-max` faz POST para endpoints do jogo durante reload/transição de página, o servidor retorna:
```
405 Method Not Allowed
```

Isso **quebra a execução inteira** de farm-max porque não há retry lógico.

**Causa raiz**:
- Durante reload, a sesão está em estado transiente
- O CSRF token pode estar momentaneamente inválido
- O servidor recusa POSTs brevemente até estabilizar

---

## ✅ A Solução Implementada

Criei **`farm-max/common/http-retry.js`** com:

### 1. **Retry com Backoff Exponencial**
```javascript
// Automático: 405 → aguarda ~300ms → tenta novamente (máx. 2 tentativas totais)
// Se falhar: lança erro final (sem retry excessivo durante reloads)
```

### 2. **Validação de CSRF Token**
```javascript
// Antes de retry, valida se CSRF está disponível
// Aguarda até 1s para o game_data se estabilizar
```

### 3. **Backoff Exponencial com Jitter**
```javascript
// Delay cresce exponencialmente: 300ms → 600ms → 1200ms
// Jitter (±20%) evita "thundering herd" em falhas simultâneas
```

---

## 📋 Como Usar

### Opção A: Usar `fetchWithRetry` (mais controle)
```javascript
import { fetchWithRetry } from '../common/http-retry.js'

const res = await fetchWithRetry(
  url,
  {
    method: "POST",
    headers,
    body,
    credentials: "include"
  },
  {
    maxRetries: 1,  // 2 tentativas totais (inicial + 1 retry)
    initialDelayMs: 300,
    maxDelayMs: 2000
  }
)
```

### Opção B: Usar `jsonWithRetry` (automatiza .json())
```javascript
import { jsonWithRetry } from '../common/http-retry.js'

const data = await jsonWithRetry(url, fetchOptions)
```

### Opção C: Usar `textWithRetry` (automatiza .text())
```javascript
import { textWithRetry } from '../common/http-retry.js'

const html = await textWithRetry(url, fetchOptions)
```

---

## 🔧 Arquivos Refatorados

1. **`farm-max/handler/break-wall/requests.js`**
   - `fetchConfirmCommand()` - linha ~100
   - `fetchPopupCommand()` - linha ~140
   - **Configuração**: `{ maxRetries: 1, initialDelayMs: 300 }` (2 tentativas totais)

2. **`farm-max/schedules/worker/service.js`**
   - Fetch genérico - linha ~50
   - **Configuração**: `{ maxRetries: 1, initialDelayMs: 300 }` (2 tentativas totais)

3. **`farm-max/handler/reports/request.js`**
   - `fetchReportView()` - linha ~20
   - **Configuração**: `{ maxRetries: 1, initialDelayMs: 300 }` (2 tentativas totais)
```javascript
// ANTES
const res = await fetch(req);
if (!res.ok) throw new Error(`HTTP ${res.status}`);

// DEPOIS
import { fetchWithRetry } from '../common/http-retry.js'
const res = await fetchWithRetry(url, fetchOptions);
if (!res.ok) throw new Error(`HTTP ${res.status}`);
```

---

## 📊 Configurações Customizáveis

```javascript
{
  maxRetries: 3,              // Quantas vezes tenta
  initialDelayMs: 500,        // Delay da 1ª tentativa
  maxDelayMs: 3000,           // Delay máximo entre tentativas
  backoffMultiplier: 2,       // Multiplica delay exponencialmente
  retryableStatuses: [        // Quais HTTP statuses retry
    405, 408, 429,
    500, 502, 503, 504
  ]
}
```

---

## 🎯 Comportamento Esperado

### Cenário: POST com 405 durante reload

**Sem solução:**
```
1. fetch(...) → 405
2. throw Error
3. ❌ farm-max inteiro para
```

**Com solução:**
```
1. fetchWithRetry(...) → 405
2. Aguarda estabilização (500ms)
3. Retry #1 → 405
4. Aguarda (1000ms)
5. Retry #2 → ✅ 200 OK
6. ✅ Continua execução normalmente
```

---

## 🚀 Próximas Etapas

1. Aplicar `fetchWithRetry` em `break-wall/requests.js`
2. Aplicar em `reports/request.js`
3. Aplicar em `schedules/worker/service.js`
4. Testar com farm-max durante reload forçado
5. Monitorar logs (`console.warn`) para 405s que forem retryados com sucesso

---

## 📝 Logs de Debug

Com a solução ativa, você verá no console:
```
[farm-max:http] 405 Method Not Allowed (url). Tentativa 1/3
[farm-max:http] Aguardando estabilização...
[farm-max:http] CSRF revalidado ✓
[farm-max:http] Sucesso na tentativa 2
```

Isso permite rastrear quantas vezes o 405 ocorreu e se foi "recuperável".
