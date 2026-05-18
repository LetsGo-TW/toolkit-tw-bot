function isRunInPage() {
  const url = new URL(window.location.href);
  if (url.searchParams.get('screen') !== 'market') return false
  if (url.searchParams.get('mode') !== 'exchange') return false

  let time = Date.now()
  if (window.PremiumExchange && !window.PremiumExchange.isHooked) {
    const originalReceiveData = window.PremiumExchange.receiveData;
    window.PremiumExchange.isHooked = true;
    window.PremiumExchange.receiveData = (data) => {
      originalReceiveData.call(window.PremiumExchange, data);
      // emitir data a cada ciclo!!!
      const exchange = Exchange.init(data);
      const t = Date.now() - time
      console.log(exchange.calculate(data), t);
      time = Date.now()
    };
  }
  return true
}
