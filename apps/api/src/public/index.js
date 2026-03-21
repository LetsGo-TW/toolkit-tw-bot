document.addEventListener("DOMContentLoaded", () => {
  /* ================================
   * 1. TOGGLE da seção de funcionalidades
   * ================================ */
  const featuresSection = document.querySelector(".features");
  const toggleButton = document.querySelector("[data-features-toggle]");
  const featuresBody = document.querySelector("[data-features-list]");

  if (featuresSection && toggleButton && featuresBody) {
    toggleButton.addEventListener("click", () => {
      const isCollapsed = featuresSection.classList.toggle("features-collapsed");
      toggleButton.setAttribute("aria-expanded", String(!isCollapsed));
    });
  }

  /* ================================
   * 2. MODAL (Termos de uso & Política)
   * ================================ */

  // abre modal pelo id (overlay)
  const openModalById = (id) => {
    const overlay = document.getElementById(id);
    if (!overlay) return;

    overlay.classList.add("active", "is-open");
    overlay.setAttribute("aria-hidden", "false");
  };

  // fecha todos os modais abertos (overlays)
  const closeActiveModals = () => {
    document.querySelectorAll(".modal-overlay.is-open").forEach((overlay) => {
      overlay.classList.remove("is-open", "active");
      overlay.setAttribute("aria-hidden", "true");
    });
  };

  // Botões que abrem o modal de termos
  const btnOpenCheck = document.getElementById("open-modal-check");
  if (btnOpenCheck) {
    btnOpenCheck.addEventListener("click", (e) => {
      e.preventDefault();
      openModalById("legal-modal");
    });
  }

  const btnOpenFooter = document.getElementById("open-modal-footer");
  if (btnOpenFooter) {
    btnOpenFooter.addEventListener("click", (e) => {
      e.preventDefault();
      openModalById("legal-modal");
    });
  }

  // Botão de fechar (X) dentro do modal
  const btnClose = document.getElementById("close-legal");
  if (btnClose) {
    btnClose.addEventListener("click", (e) => {
      e.preventDefault();
      closeActiveModals();
    });
  }

  // Fechar clicando no fundo (overlay)
  document.addEventListener("click", (e) => {
    const overlay = e.target.closest(".modal-overlay");
    // só fecha se o clique for diretamente no overlay, e não dentro do .modal
    if (overlay && e.target === overlay) {
      closeActiveModals();
    }
  });

  // Fechar com ESC
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeActiveModals();
    }
  });

  /* ================================
   * 3. CHECKBOX → libera download
   * ================================ */
  const acceptTerms = document.getElementById("accept-terms");
  const btnDownload = document.getElementById("btn-download");
  const warning = document.getElementById("legal-warning");

  if (acceptTerms && btnDownload && warning) {
    const updateDownloadState = () => {
      if (acceptTerms.checked) {
        btnDownload.classList.remove("disabled");
        btnDownload.setAttribute("aria-disabled", "false");
        warning.classList.add("hidden");
      } else {
        btnDownload.classList.add("disabled");
        btnDownload.setAttribute("aria-disabled", "true");
        // não mostra o warning aqui pra não ficar chato;
        // só mostra quando o user tenta baixar sem marcar.
      }
    };

    // Estado inicial
    updateDownloadState();

    // Toda vez que marcar/desmarcar o checkbox
    acceptTerms.addEventListener("change", () => {
      updateDownloadState();
    });

    // Clique no botão de download
    btnDownload.addEventListener("click", (e) => {
      if (!acceptTerms.checked) {
        e.preventDefault(); // impede o download
        warning.classList.remove("hidden");
      }
      // se estiver marcado, segue o fluxo normal do link (download)
    });
  }
});
