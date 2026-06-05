/**
 * acessibilidade.js — Widget de Acessibilidade para Baixa Visão
 * Anhanguera Imperatriz — Mapa de Salas e Laboratórios
 *
 * Estratégia de escala de fonte:
 *  - O CSS usa px fixos e clamp(), então html/body font-size não funciona.
 *  - Usamos classes body.fonte-N (N = 0..4) que sobrescrevem todos os
 *    tamanhos relevantes com !important via stylesheet injetado.
 */

(function () {
    'use strict';

    /* ─── Níveis de escala ──────────────────────────────────────
     * Cada nível multiplica os tamanhos base da UI.
     * Nível 2 = padrão original.
     */
    const NIVEIS = [
        { label: 'Muito pequeno', mult: 0.82 },
        { label: 'Pequeno',       mult: 0.91 },
        { label: 'Padrão',        mult: 1.00 },  // índice 2 = padrão
        { label: 'Grande',        mult: 1.20 },
        { label: 'Muito grande',  mult: 1.45 },
    ];
    const NIVEL_PADRAO = 2;

    /* Tamanhos BASE (px) para cada elemento — valores do CSS original */
    const BASE = {
        btnTipo:       16,   // .btn-tipo
        btn:           14,   // .btn
        sectionH2:     18,   // .section h2
        sectionCenter: 26,   // .sectionCenter h1  (meio do clamp)
        sectionH2Hero: 15,   // .sectionCenter h2
        breadcrumb:    13,   // .breadcrumb-item
        profNome:      15,   // .professor-nome
        descDiv:       13,   // .descricaoDiv
        infoLabel:     11,   // .info-item .info-label
        listItem:      14,   // li (padrão body)
        filtroInput:   14,   // inputs de busca
        subtitulo:     14,   // .section-subtitle
        buttonReturn:  13,   // .buttonReturn
        footer:        12,   // .footer
    };

    const LS = {
        NIVEL:     'a11y_nivel',
        CONTRASTE: 'a11y_contraste',
        ESPACO:    'a11y_espaco',
    };

    /* ─── Estado ─────────────────────────────────────────────── */
    let nivelAtual    = parseInt(localStorage.getItem(LS.NIVEL) ?? NIVEL_PADRAO);
    let altoContraste = localStorage.getItem(LS.CONTRASTE) === 'true';
    let espacamento   = localStorage.getItem(LS.ESPACO)    === 'true';

    /* ─── Stylesheet dinâmico ─────────────────────────────────── */
    const styleTag = document.createElement('style');
    styleTag.id = 'a11y-font-style';
    document.head.appendChild(styleTag);

    function px(base, mult) {
        return Math.round(base * mult) + 'px';
    }

    function aplicarNivel(nivel) {
        if (nivel < 0) nivel = 0;
        if (nivel >= NIVEIS.length) nivel = NIVEIS.length - 1;
        nivelAtual = nivel;

        const m = NIVEIS[nivel].mult;

        if (m === 1) {
            // Padrão: remove qualquer override
            styleTag.textContent = '';
        } else {
            styleTag.textContent = `
                /* ── Acessibilidade: escala ${NIVEIS[nivel].label} (×${m}) ── */
                .sectionCenter h1 {
                    font-size: ${px(BASE.sectionCenter, m)} !important;
                }
                .sectionCenter h2 {
                    font-size: ${px(BASE.sectionCenter2 || 15, m)} !important;
                }
                .section h2, .headeDisplay h2 {
                    font-size: ${px(BASE.sectionH2, m)} !important;
                }
                .section-subtitle {
                    font-size: ${px(BASE.subtitulo, m)} !important;
                }
                .btn {
                    font-size: ${px(BASE.btn, m)} !important;
                }
                .btn-tipo {
                    font-size: ${px(BASE.btnTipo, m)} !important;
                }
                .btn-tipo .btn-icon {
                    font-size: ${px(24, m)} !important;
                }
                .buttonReturn {
                    font-size: ${px(BASE.buttonReturn, m)} !important;
                }
                li, .resultado-card {
                    font-size: ${px(BASE.listItem, m)} !important;
                }
                .professor-nome {
                    font-size: ${px(BASE.profNome, m)} !important;
                }
                .descricaoDiv {
                    font-size: ${px(BASE.descDiv, m)} !important;
                }
                .info-item .info-label {
                    font-size: ${px(BASE.infoLabel, m)} !important;
                }
                .info-item .info-value {
                    font-size: ${px(13, m)} !important;
                }
                #filtro-input-curso,
                #filtro-input-professores,
                #filtro-input-laboratorio,
                #filtro-detalhes-laboratorio {
                    font-size: ${px(BASE.filtroInput, m)} !important;
                }
                .breadcrumb-item {
                    font-size: ${px(BASE.breadcrumb, m)} !important;
                }
                .footer {
                    font-size: ${px(BASE.footer, m)} !important;
                }
                .cookie-content p {
                    font-size: ${px(13, m)} !important;
                }
                /* Padding proporcional nos botões e itens para manter legibilidade */
                ${m >= 1.2 ? `
                .btn { padding: ${px(14 * m, 1)} ${px(20, 1)} !important; }
                .btn-tipo { padding: ${px(20, 1)} ${px(24, 1)} !important; }
                li { padding: ${px(16 * Math.min(m, 1.35), 1)} ${px(20, 1)} !important; }
                ` : ''}
            `;
        }

        localStorage.setItem(LS.NIVEL, nivelAtual);
        atualizarBotoesNivel();
        anunciarSR('Tamanho do texto: ' + NIVEIS[nivel].label);
    }

    function atualizarBotoesNivel() {
        const btnMenos = document.getElementById('btn-fonte-menos');
        const btnMais  = document.getElementById('btn-fonte-mais');
        const label    = document.getElementById('a11y-nivel-label');

        if (btnMenos) btnMenos.disabled = (nivelAtual <= 0);
        if (btnMais)  btnMais.disabled  = (nivelAtual >= NIVEIS.length - 1);
        if (label)    label.textContent  = NIVEIS[nivelAtual].label;
    }

    /* ─── Painel toggle ──────────────────────────────────────── */
    window.toggleA11yPanel = function () {
        const painel    = document.getElementById('acessibilidade-painel');
        const btnToggle = document.getElementById('btn-a11y-toggle');
        if (!painel || !btnToggle) return;

        const estaAberto = !painel.hidden;
        painel.hidden = estaAberto;
        btnToggle.setAttribute('aria-expanded', String(!estaAberto));

        if (!estaAberto) {
            const primeiro = painel.querySelector('button:not(.a11y-fechar)');
            if (primeiro) primeiro.focus();
        }
    };

    /* ─── API pública ────────────────────────────────────────── */
    window.ajustarFonte = function (direcao) {
        aplicarNivel(nivelAtual + direcao);
    };

    window.resetarFonte = function () {
        aplicarNivel(NIVEL_PADRAO);
    };

    /* ─── Alto contraste ─────────────────────────────────────── */
    window.toggleAltoContraste = function () {
        altoContraste = !altoContraste;
        document.body.classList.toggle('alto-contraste', altoContraste);
        localStorage.setItem(LS.CONTRASTE, altoContraste);
        atualizarBotaoContraste(altoContraste);
        anunciarSR(altoContraste ? 'Alto contraste ativado' : 'Alto contraste desativado');
    };

    function atualizarBotaoContraste(ativo) {
        const btn = document.getElementById('btn-alto-contraste');
        if (!btn) return;
        btn.setAttribute('aria-pressed', String(ativo));
        btn.innerHTML = ativo
            ? '<span class="a11y-toggle-icon">◑</span> Desativar'
            : '<span class="a11y-toggle-icon">◐</span> Ativar';
    }

    /* ─── Espaçamento aumentado ──────────────────────────────── */
    window.toggleEspacamento = function () {
        espacamento = !espacamento;
        document.body.classList.toggle('espacamento-aumentado', espacamento);
        localStorage.setItem(LS.ESPACO, espacamento);
        atualizarBotaoEspaco(espacamento);
        anunciarSR(espacamento ? 'Espaçamento aumentado ativado' : 'Espaçamento aumentado desativado');
    };

    function atualizarBotaoEspaco(ativo) {
        const btn = document.getElementById('btn-espacamento');
        if (!btn) return;
        btn.setAttribute('aria-pressed', String(ativo));
        btn.innerHTML = ativo
            ? '<span class="a11y-toggle-icon">↕</span> Desativar'
            : '<span class="a11y-toggle-icon">↕</span> Ativar';
    }

    /* ─── Redefinir tudo ─────────────────────────────────────── */
    window.resetarTudo = function () {
        altoContraste = false;
        espacamento   = false;

        document.body.classList.remove('alto-contraste', 'espacamento-aumentado');
        localStorage.removeItem(LS.CONTRASTE);
        localStorage.removeItem(LS.ESPACO);

        atualizarBotaoContraste(false);
        atualizarBotaoEspaco(false);

        aplicarNivel(NIVEL_PADRAO); // também limpa LS.NIVEL
        anunciarSR('Configurações de acessibilidade redefinidas');
    };

    /* ─── ARIA live region ───────────────────────────────────── */
    const liveRegion = document.createElement('div');
    liveRegion.setAttribute('aria-live', 'polite');
    liveRegion.setAttribute('aria-atomic', 'true');
    liveRegion.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;';
    document.body.appendChild(liveRegion);

    function anunciarSR(msg) {
        liveRegion.textContent = '';
        setTimeout(() => { liveRegion.textContent = msg; }, 50);
    }

    /* ─── Fechar com Escape ──────────────────────────────────── */
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            const painel = document.getElementById('acessibilidade-painel');
            if (painel && !painel.hidden) {
                painel.hidden = true;
                document.getElementById('btn-a11y-toggle')
                    ?.setAttribute('aria-expanded', 'false');
                document.getElementById('btn-a11y-toggle')?.focus();
            }
        }
    });

    /* ─── Inicializar ────────────────────────────────────────── */
    aplicarNivel(nivelAtual);

    if (altoContraste) {
        document.body.classList.add('alto-contraste');
        atualizarBotaoContraste(true);
    }
    if (espacamento) {
        document.body.classList.add('espacamento-aumentado');
        atualizarBotaoEspaco(true);
    }

})();
