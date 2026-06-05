// =================== Configurações ===================
// Fontes de dados disponíveis
const FONTES = {
    APPSCRIPT: 'appscript',
    SUPABASE: 'supabase'
};

// Configuração individual por tipo de mapa
// Defina qual fonte usar para cada tipo: FONTES.APPSCRIPT ou FONTES.SUPABASE
const CONFIG_FONTES = {
    salas: FONTES.SUPABASE,        // Mapa de Salas: 'appscript' ou 'supabase'
    laboratorios: FONTES.SUPABASE  // Mapa de Laboratórios: 'appscript' ou 'supabase'
};

// URLs das fontes de dados
const APPSCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx1RQRmwIPCCa0hAqn86ssRc-HfCfNuh2tbanpzFCmsmBXIOzSe7gEzS24eZeqRYN_z/exec';
const SUPABASE_URL = 'https://vjudjvidoasdpilfivlx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqdWRqdmlkb2FzZHBpbGZpdmx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3MzcxNTAsImV4cCI6MjA3OTMxMzE1MH0.c4FoMY_7HNUazOklcGuvuubE6Fc3CGb2q9kNzdK36X8';

// Configuração do Cache
const CACHE_TTL_MINUTOS = 2; // Tempo de vida do cache em minutos

let dados = [];
let dadosLaboratorio = [];



// =================== Variáveis de Estado ===================

let periodoSelecionado = '';
let diaSelecionado = '';
let diaLaboratorioSelecionado = '';
let turnoLaboratorioSelecionado = '';
let cursoSelecionado = '';
let cursoLaboratorioSelecionado = '';
let tipoMapaSelecionado = ''; // 'sala' ou 'laboratorio'

// =================== Funções de Fetch ===================

// Sistema de Cache Híbrido com TTL
// Prioridade: localStorage (persistente) > memória (temporário)
const CACHE_PREFIX = 'anhanguera_cache_';
const cacheMemoria = new Map(); // Fallback em memória

// Detecta se localStorage está disponível
function localStorageDisponivel() {
    try {
        const teste = '__teste_storage__';
        localStorage.setItem(teste, teste);
        localStorage.removeItem(teste);
        return true;
    } catch (e) {
        return false;
    }
}

const USA_LOCAL_STORAGE = localStorageDisponivel();
if (!USA_LOCAL_STORAGE) {
    console.warn('⚠️ localStorage indisponível. Usando cache em memória (não persiste após refresh).');
}

// Gera uma chave única para o cache baseada nos parâmetros
function gerarChaveCache(tipo, filtros) {
    return `${CACHE_PREFIX}${tipo}_${filtros?.turno || 'all'}_${filtros?.dia || 'all'}`;
}

// Verifica se o cache ainda é válido (não expirou)
function cacheValido(cacheEntry) {
    if (!cacheEntry) return false;
    const agora = Date.now();
    const ttlMs = CACHE_TTL_MINUTOS * 60 * 1000;
    return (agora - cacheEntry.timestamp) < ttlMs;
}

// Salva dados no cache (localStorage ou memória)
function salvarNoCache(chave, dados) {
    const entry = {
        dados: dados,
        timestamp: Date.now()
    };

    if (USA_LOCAL_STORAGE) {
        try {
            localStorage.setItem(chave, JSON.stringify(entry));
            console.log(`💾 Cache salvo [localStorage]: ${chave} (válido por ${CACHE_TTL_MINUTOS} min)`);
        } catch (e) {
            // Se falhar (ex: quota excedida), usa memória
            cacheMemoria.set(chave, entry);
            console.log(`💾 Cache salvo [memória]: ${chave} (válido por ${CACHE_TTL_MINUTOS} min)`);
        }
    } else {
        cacheMemoria.set(chave, entry);
        console.log(`💾 Cache salvo [memória]: ${chave} (válido por ${CACHE_TTL_MINUTOS} min)`);
    }
}

// Busca dados do cache (localStorage ou memória)
function buscarDoCache(chave) {
    let entry = null;
    let fonte = '';

    // Tenta localStorage primeiro
    if (USA_LOCAL_STORAGE) {
        try {
            const entryStr = localStorage.getItem(chave);
            if (entryStr) {
                entry = JSON.parse(entryStr);
                fonte = 'localStorage';
            }
        } catch (e) {
            // Ignora erro e tenta memória
        }
    }

    // Se não encontrou no localStorage, tenta memória
    if (!entry && cacheMemoria.has(chave)) {
        entry = cacheMemoria.get(chave);
        fonte = 'memória';
    }

    if (!entry) return null;

    if (cacheValido(entry)) {
        const tempoRestante = Math.ceil((CACHE_TTL_MINUTOS * 60 * 1000 - (Date.now() - entry.timestamp)) / 1000);
        console.log(`✅ Cache hit [${fonte}]: ${chave} (expira em ${tempoRestante}s)`);
        return entry.dados;
    }

    // Cache expirado - remove
    console.log(`⏰ Cache expirado: ${chave}`);
    if (USA_LOCAL_STORAGE) {
        try { localStorage.removeItem(chave); } catch (e) { }
    }
    cacheMemoria.delete(chave);
    return null;
}

// Limpa todo o cache (localStorage e memória)
function limparCache() {
    let countLocal = 0;
    let countMemoria = cacheMemoria.size;

    // Limpa localStorage
    if (USA_LOCAL_STORAGE) {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(CACHE_PREFIX)) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
        countLocal = keysToRemove.length;
    }

    // Limpa memória
    cacheMemoria.clear();
    cacheAppScript = null;

    console.log(`🗑️ Cache limpo! (${countLocal} localStorage + ${countMemoria} memória)`);
}

// Cache para evitar múltiplas requisições ao AppScript (dados brutos)
let cacheAppScript = null;

async function fetchDadosAppScript(tipo, filtros) {
    // AppScript não suporta filtros, então busca todos os dados e filtra localmente
    // Usa cache se já tiver carregado antes
    if (!cacheAppScript) {
        const response = await fetch(APPSCRIPT_URL);
        if (!response.ok) {
            throw new Error(`Erro na requisição: ${response.status}`);
        }

        const data = await response.json();
        if (!data.data) {
            throw new Error("Dados não encontrados na resposta.");
        }

        cacheAppScript = data.data;
    }

    // Seleciona a fonte correta baseado no tipo
    let dadosFonte = tipo === 'salas' ? cacheAppScript["Dados"] : cacheAppScript["Dados Laboratório"];

    // Filtra localmente
    if (dadosFonte && filtros) {
        dadosFonte = dadosFonte.filter(item => {
            let match = true;
            if (filtros.turno) match = match && item.turno === filtros.turno;
            if (filtros.dia) match = match && item.dia === filtros.dia;
            return match;
        });
    }

    return dadosFonte || [];
}

async function fetchDadosSupabase(tipo, filtros) {
    if (tipo === 'laboratorios') {
        const url = new URL(`${SUPABASE_URL}/functions/v1/Cadastro`);
        if (filtros.turno) {
            url.searchParams.append('currentTurno', filtros.turno);
        }
        if (filtros.dia) {
            url.searchParams.append('currentDay', filtros.dia);
        }

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Erro na Edge Function Cadastro: ${response.status}`);
        }

        const resData = await response.json();
        return Array.isArray(resData) ? resData : (resData.data || []);
    }

    // Mapeamento dos tipos para nomes das tabelas no Supabase
    const TABELAS_SUPABASE = {
        salas: 'horarios'              // Tabela de salas/horários
    };

    // Colunas permitidas para cada tipo (apenas dados públicos)
    const COLUNAS_SUPABASE = {
        salas: 'ID,bloco,curso,dia,disciplina,hora,periodo,professor,sala,turno'
    };

    const tabela = TABELAS_SUPABASE[tipo];
    const colunas = COLUNAS_SUPABASE[tipo];

    // Constrói a query com colunas específicas e filtros
    let url = `${SUPABASE_URL}/rest/v1/${tabela}?select=${colunas}`;

    if (filtros.turno) {
        url += `&turno=eq.${encodeURIComponent(filtros.turno)}`;
    }
    if (filtros.dia) {
        url += `&dia=eq.${encodeURIComponent(filtros.dia)}`;
    }

    const response = await fetch(url, {
        headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json'
        }
    });

    if (!response.ok) {
        throw new Error(`Erro na requisição Supabase: ${response.status}`);
    }

    return await response.json();
}

async function fetchDados(tipo, filtros) {
    try {
        // Verifica se tem dados válidos no cache
        const chaveCache = gerarChaveCache(tipo, filtros);
        const dadosCache = buscarDoCache(chaveCache);

        if (dadosCache) {
            // Retorna dados do cache sem fazer requisição
            return dadosCache;
        }

        // Mostra o loading (apenas se não tiver cache)
        document.getElementById("loading").classList.remove("hidden");
        document.body.classList.remove("loaded");

        let resultado;

        // Verifica qual fonte usar para este tipo específico
        const fonteAtual = CONFIG_FONTES[tipo] || FONTES.APPSCRIPT;

        if (fonteAtual === FONTES.APPSCRIPT) {
            // AppScript
            resultado = await fetchDadosAppScript(tipo, filtros);
        } else {
            // Supabase
            resultado = await fetchDadosSupabase(tipo, filtros);
        }

        // Salva no cache para próximas consultas
        salvarNoCache(chaveCache, resultado);

        // Oculta o loading
        document.getElementById("loading").classList.add("hidden");
        document.body.classList.add("loaded");

        return resultado;

    } catch (error) {
        console.error("❌ Erro ao buscar dados:", error);
        document.getElementById("loading").innerHTML = `
            <div class="loading-content">
                <div style="font-size: 40px; margin-bottom: 12px;">⚠️</div>
                <p>Erro ao carregar os dados.</p>
            </div>`;
        return [];
    }
}

// =================== Inicialização ===================

window.onload = () => {
    document.getElementById("loading").classList.add("hidden");
    document.body.classList.add("loaded");
    document.querySelector(".sectionCenter").style.display = "flex";

    // Restaura tema salvo
    restaurarTema();
    
    // Verifica aviso de cookies (LGPD)
    verificarCookies();
};

// =================== Breadcrumb ===================

function atualizarBreadcrumb(itens) {
    const breadcrumb = document.getElementById('breadcrumb');
    if (!itens || itens.length === 0) {
        breadcrumb.classList.add('hidden');
        return;
    }

    breadcrumb.classList.remove('hidden');
    breadcrumb.innerHTML = '';

    itens.forEach((item, index) => {
        const span = document.createElement('span');
        span.className = 'breadcrumb-item' + (index === itens.length - 1 ? ' active' : '');
        span.textContent = item;
        breadcrumb.appendChild(span);

        if (index < itens.length - 1) {
            const sep = document.createElement('span');
            sep.className = 'breadcrumb-separator';
            sep.textContent = '›';
            breadcrumb.appendChild(sep);
        }
    });
}

// =================== Transição de Seção ===================

function mostrarSecao(id) {
    const section = document.getElementById(id);
    section.classList.remove('hidden');
    // Re-trigger animation
    section.style.animation = 'none';
    section.offsetHeight; // force reflow
    section.style.animation = '';
}

// =================== Funções de Seleção ===================

function selecionarTipoMapa(tipo) {
    tipoMapaSelecionado = tipo;
    document.getElementById('tipo-mapa-section').classList.add('hidden');

    if (tipo === 'sala') {
        mostrarSecao('periodo-section');
        atualizarBreadcrumb(['🏫 Salas', 'Turno']);
    } else {
        mostrarSecao('dia-laboratorio-section');
        atualizarBreadcrumb(['🔬 Laboratórios', 'Dia']);
    }
}

function selecionarPeriodo(periodo) {
    periodoSelecionado = periodo;
    document.getElementById('periodo-section').classList.add('hidden');
    mostrarSecao('dia-section');
    atualizarBreadcrumb(['🏫 Salas', periodo, 'Dia']);
}

function selecionarDia(dia) {
    diaSelecionado = dia;
    document.getElementById('dia-section').classList.add('hidden');
    mostrarSecao('opcao-section');
    atualizarBreadcrumb(['🏫 Salas', periodoSelecionado, dia, 'Curso']);
    carregarEMostrarCursos();
}

function selecionarDiaLaboratorio(dia_lab) {
    diaLaboratorioSelecionado = dia_lab;
    document.getElementById('dia-laboratorio-section').classList.add('hidden');
    mostrarSecao('turno-section');
    atualizarBreadcrumb(['🔬 Labs', dia_lab, 'Turno']);
}

function selecionarTurno(turno_lab) {
    turnoLaboratorioSelecionado = turno_lab;
    document.getElementById('turno-section').classList.add('hidden');
    mostrarSecao('opcao-section-laboratorio');
    atualizarBreadcrumb(['🔬 Labs', diaLaboratorioSelecionado, turno_lab, 'Curso']);
    carregarEMostrarCursosLaboratorio();
}

// =================== Exibição Cursos ===================

async function carregarEMostrarCursos() {
    // Faz o fetch com os filtros selecionados
    dados = await fetchDados('salas', {
        turno: periodoSelecionado,
        dia: diaSelecionado
    });

    mostrarCursos();
}

function mostrarCursos() {
    const lista = document.getElementById('lista-cursos');
    lista.innerHTML = '';

    // Dados já vêm filtrados do servidor, mas podemos filtrar localmente se necessário
    const cursosFiltrados = dados.filter(d => d.turno === periodoSelecionado && d.dia === diaSelecionado);

    if (cursosFiltrados.length === 0) {
        lista.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📭</div>
                <p>Nenhum curso encontrado para este turno e dia.</p>
            </div>`;
        return;
    }

    const cursos = [...new Set(cursosFiltrados.map(item => item.curso))];

    cursos.forEach(curso => {
        const li = document.createElement('li');
        li.textContent = curso;
        li.onclick = () => mostrarProfessores(curso);
        lista.appendChild(li);
    });
}

function mostrarProfessores(curso) {
    cursoSelecionado = curso;
    document.getElementById('opcao-section').classList.add('hidden');
    mostrarSecao('lista-section');
    atualizarBreadcrumb(['🏫 Salas', periodoSelecionado, diaSelecionado, curso]);

    // Atualiza título
    document.getElementById('lista-titulo').textContent = curso;

    const professoresFiltrados = dados.filter(item =>
        item.curso === curso &&
        item.turno === periodoSelecionado &&
        item.dia === diaSelecionado
    );

    const lista = document.getElementById('lista-professores');
    lista.innerHTML = '';

    if (professoresFiltrados.length === 0) {
        lista.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📭</div>
                <p>Nenhum professor encontrado.</p>
            </div>`;
        return;
    }

    professoresFiltrados.forEach(item => {
        const li = document.createElement('li');
        li.className = 'resultado-card';

        if (typeof item.sala === 'string' && item.sala.trim().toLowerCase() === 'aula cancelada') {
            li.classList.add('cancelado');
        }

        const professorDiv = document.createElement('div');
        professorDiv.className = 'professor-nome';
        professorDiv.textContent = item.professor;

        const detalhesDiv = document.createElement('div');
        detalhesDiv.className = 'descricaoDiv';
        detalhesDiv.innerHTML = `
            <div class="info-item info-full">
                <span class="info-icon">📖</span>
                <span><span class="info-label">Disciplina </span><span class="info-value">${item.disciplina}</span></span>
            </div>
            <div class="info-item">
                <span class="info-icon">📍</span>
                <span><span class="info-label">Sala </span><span class="info-value">${item.sala}</span></span>
            </div>
            <div class="info-item">
                <span class="info-icon">🏢</span>
                <span><span class="info-label">Bloco </span><span class="info-value">${item.bloco}</span></span>
            </div>
            <div class="info-item">
                <span class="info-icon">🕐</span>
                <span><span class="info-label">Hora </span><span class="info-value">${item.hora}</span></span>
            </div>
            <div class="info-item">
                <span class="info-icon">📅</span>
                <span><span class="info-label">Período </span><span class="info-value">${item.periodo}</span></span>
            </div>`;

        li.appendChild(professorDiv);
        li.appendChild(detalhesDiv);

        lista.appendChild(li);
    });
}

// =================== Exibição Laboratórios ===================

async function carregarEMostrarCursosLaboratorio() {
    // Faz o fetch com os filtros selecionados. A RLS do banco já cuida de omitir os dados ocultos!
    dadosLaboratorio = await fetchDados('laboratorios', {
        turno: turnoLaboratorioSelecionado,
        dia: diaLaboratorioSelecionado
    });

    mostrarCursosLaboratorio();
}

function mostrarCursosLaboratorio() {
    const lista = document.getElementById('lista-cursos-laboratorio');
    lista.innerHTML = '';

    // Dados já vêm filtrados do servidor
    const cursosFiltrados = dadosLaboratorio.filter(lab =>
        lab.dia === diaLaboratorioSelecionado &&
        lab.turno === turnoLaboratorioSelecionado
    );

    if (cursosFiltrados.length === 0) {
        lista.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📭</div>
                <p>Nenhum curso encontrado para este dia e turno.</p>
            </div>`;
        return;
    }

    const cursos = [...new Set(cursosFiltrados.map(item => item.curso))];

    cursos.forEach(curso => {
        const li = document.createElement('li');
        li.textContent = curso;
        li.onclick = () => mostrarLaboratorioPorCurso(curso);
        lista.appendChild(li);
    });
}

function mostrarLaboratorioPorCurso(curso) {
    cursoLaboratorioSelecionado = curso;
    document.getElementById('opcao-section-laboratorio').classList.add('hidden');
    mostrarSecao('lista-section-laboratorio');
    atualizarBreadcrumb(['🔬 Labs', diaLaboratorioSelecionado, turnoLaboratorioSelecionado, curso]);

    // Atualiza título
    document.getElementById('lista-titulo-laboratorio').textContent = curso;

    const lista = document.getElementById('lista-detalhes-laboratorio');
    lista.innerHTML = '';

    const laboratoriosFiltrados = dadosLaboratorio.filter(lab =>
        lab.curso === curso &&
        lab.dia === diaLaboratorioSelecionado &&
        lab.turno === turnoLaboratorioSelecionado
    );

    if (laboratoriosFiltrados.length === 0) {
        lista.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📭</div>
                <p>Nenhum laboratório encontrado.</p>
            </div>`;
        return;
    }

    laboratoriosFiltrados.forEach(item => {
        const li = document.createElement('li');
        li.className = 'resultado-card';

        if (item.laboratorio.trim().toLowerCase() === 'aula cancelada') {
            li.classList.add('cancelado');
        }

        const professorDiv = document.createElement('div');
        professorDiv.className = 'professor-nome';
        professorDiv.textContent = item.professor;

        const dataFormatada = new Date(item.data).toLocaleDateString("pt-BR");

        const detalhesDiv = document.createElement('div');
        detalhesDiv.className = 'descricaoDiv';
        detalhesDiv.innerHTML = `
            <div class="info-item info-full">
                <span class="info-icon">📖</span>
                <span><span class="info-label">Disciplina </span><span class="info-value">${item.disciplina}</span></span>
            </div>
            <div class="info-item">
                <span class="info-icon">🧪</span>
                <span><span class="info-label">Lab </span><span class="info-value">${item.laboratorio}</span></span>
            </div>
            <div class="info-item">
                <span class="info-icon">🏢</span>
                <span><span class="info-label">Bloco </span><span class="info-value">${item.bloco}</span></span>
            </div>
            <div class="info-item">
                <span class="info-icon">🕐</span>
                <span><span class="info-label">Hora </span><span class="info-value">${item.hora}</span></span>
            </div>
            <div class="info-item">
                <span class="info-icon">📅</span>
                <span><span class="info-label">Período </span><span class="info-value">${item.periodo}</span></span>
            </div>
            <div class="info-item">
                <span class="info-icon">📆</span>
                <span><span class="info-label">Data </span><span class="info-value">${dataFormatada}</span></span>
            </div>`;

        li.appendChild(professorDiv);
        li.appendChild(detalhesDiv);

        lista.appendChild(li);
    });
}

// =================== Voltar ===================

function voltar(passo) {
    switch (passo) {
        case 'tipo-mapa':
            // Volta para a tela inicial
            document.getElementById('periodo-section').classList.add('hidden');
            document.getElementById('dia-section').classList.add('hidden');
            document.getElementById('dia-laboratorio-section').classList.add('hidden');
            document.getElementById('turno-section').classList.add('hidden');
            document.getElementById('opcao-section').classList.add('hidden');
            document.getElementById('opcao-section-laboratorio').classList.add('hidden');
            document.getElementById('lista-section').classList.add('hidden');
            document.getElementById('lista-section-laboratorio').classList.add('hidden');
            mostrarSecao('tipo-mapa-section');
            atualizarBreadcrumb([]);
            break;

        case 'periodo':
            document.getElementById('dia-section').classList.add('hidden');
            document.getElementById('opcao-section').classList.add('hidden');
            document.getElementById('lista-section').classList.add('hidden');
            mostrarSecao('periodo-section');
            atualizarBreadcrumb(['🏫 Salas', 'Turno']);
            break;

        case 'dia':
            document.getElementById('opcao-section').classList.add('hidden');
            document.getElementById('lista-section').classList.add('hidden');
            mostrarSecao('dia-section');
            atualizarBreadcrumb(['🏫 Salas', periodoSelecionado, 'Dia']);
            break;

        case 'opcao':
            document.getElementById('lista-section').classList.add('hidden');
            mostrarSecao('opcao-section');
            atualizarBreadcrumb(['🏫 Salas', periodoSelecionado, diaSelecionado, 'Curso']);
            break;

        case 'dia-laboratorio':
            document.getElementById('turno-section').classList.add('hidden');
            document.getElementById('opcao-section-laboratorio').classList.add('hidden');
            document.getElementById('lista-section-laboratorio').classList.add('hidden');
            mostrarSecao('dia-laboratorio-section');
            atualizarBreadcrumb(['🔬 Labs', 'Dia']);
            break;

        case 'turno':
            document.getElementById('opcao-section-laboratorio').classList.add('hidden');
            document.getElementById('lista-section-laboratorio').classList.add('hidden');
            mostrarSecao('turno-section');
            atualizarBreadcrumb(['🔬 Labs', diaLaboratorioSelecionado, 'Turno']);
            break;

        case 'opcao-laboratorio':
            document.getElementById('lista-section-laboratorio').classList.add('hidden');
            mostrarSecao('opcao-section-laboratorio');
            atualizarBreadcrumb(['🔬 Labs', diaLaboratorioSelecionado, turnoLaboratorioSelecionado, 'Curso']);
            break;
    }
}

// =================== Filtros ===================

function filtrarLista() {
    const filtro = document.getElementById('filtro-input-professores').value.toLowerCase();
    const lista = document.getElementById('lista-professores');
    const itens = lista.getElementsByTagName('li');

    for (let i = 0; i < itens.length; i++) {
        const itemTexto = itens[i].textContent || itens[i].innerText;
        itens[i].style.display = itemTexto.toLowerCase().includes(filtro) ? '' : 'none';
    }
}

function filtrarCurso() {
    const filtro = document.getElementById('filtro-input-curso').value.toLowerCase();
    const lista = document.getElementById('lista-cursos');
    const itens = lista.getElementsByTagName('li');

    for (let i = 0; i < itens.length; i++) {
        const itemTexto = itens[i].textContent || itens[i].innerText;
        itens[i].style.display = itemTexto.toLowerCase().includes(filtro) ? '' : 'none';
    }
}

function filtrarDetalhesLaboratorio() {
    const input = document.getElementById("filtro-detalhes-laboratorio").value.toLowerCase();
    const lista = document.getElementById("lista-detalhes-laboratorio");
    const itens = lista.getElementsByTagName("li");

    for (let i = 0; i < itens.length; i++) {
        const texto = itens[i].innerText.toLowerCase();
        itens[i].style.display = texto.includes(input) ? "" : "none";
    }
}

function filtrarListaLaboratorio() {
    const filtro = document.getElementById('filtro-input-laboratorio').value.toLowerCase();
    const lista = document.getElementById('lista-cursos-laboratorio');
    const itens = lista.getElementsByTagName('li');

    for (let i = 0; i < itens.length; i++) {
        const itemTexto = itens[i].textContent || itens[i].innerText;
        itens[i].style.display = itemTexto.toLowerCase().includes(filtro) ? '' : 'none';
    }
}

// =================== Tema Claro / Escuro ===================

function toggleTheme() {
    document.body.classList.toggle('light-mode');
    const isLight = document.body.classList.contains('light-mode');

    // Atualiza logo
    const logoNavbar = document.getElementById('logo-navbar');
    if (isLight) {
        logoNavbar.src = 'images/logo-anhanguera-horizontal.png';
    } else {
        logoNavbar.src = 'images/logo-anhanguera-horizontal-branca.png';
    }

    // Atualiza ícone do botão
    const btnTheme = document.getElementById('btn-theme');
    btnTheme.textContent = isLight ? '☀️' : '🌙';

    // Salva preferência
    if (USA_LOCAL_STORAGE) {
        try {
            localStorage.setItem('anhanguera_tema', isLight ? 'light' : 'dark');
        } catch (e) { }
    }
}

function restaurarTema() {
    if (!USA_LOCAL_STORAGE) return;

    try {
        const temaSalvo = localStorage.getItem('anhanguera_tema');
        if (temaSalvo === 'light') {
            document.body.classList.add('light-mode');
            const logoNavbar = document.getElementById('logo-navbar');
            if (logoNavbar) logoNavbar.src = 'images/logo-anhanguera-horizontal.png';
            const btnTheme = document.getElementById('btn-theme');
            if (btnTheme) btnTheme.textContent = '☀️';
        }
    } catch (e) { }
}

// Garante que a logo esteja certa ao recarregar a página
window.addEventListener('DOMContentLoaded', () => {
    const logo = document.getElementById('logo-navbar');

    if (logo) {
        const atualizarLogo = () => {
            if (document.body.classList.contains('light-mode')) {
                logo.src = 'images/logo-anhanguera-horizontal.png';
            } else {
                logo.src = 'images/logo-anhanguera-horizontal-branca.png';
            }
        };

        atualizarLogo();

        const botaoTema = document.querySelector('.theme-toggle');
        if (botaoTema) {
            botaoTema.addEventListener('click', atualizarLogo);
        }
    } else {
        console.warn('⚠️ Elemento com id="logo-principal" não encontrado.');
    }
});

// =================== LGPD / Cookies ===================

function verificarCookies() {
    if (USA_LOCAL_STORAGE) {
        const aceitou = localStorage.getItem('anhanguera_cookies_aceitos');
        if (!aceitou) {
            // Pequeno delay para a animação ficar mais fluida ao carregar a página
            setTimeout(() => {
                document.getElementById('cookie-banner').classList.remove('hidden');
            }, 1000);
        }
    }
}

function aceitarCookies() {
    if (USA_LOCAL_STORAGE) {
        localStorage.setItem('anhanguera_cookies_aceitos', 'true');
    }
    const banner = document.getElementById('cookie-banner');
    
    // Animação de saída
    banner.style.animation = 'slideUpCookie 0.4s reverse forwards';
    
    setTimeout(() => {
        banner.classList.add('hidden');
        banner.style.animation = ''; // Limpa a animação para futuras utilizações
    }, 400);
}