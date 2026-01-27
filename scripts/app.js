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
    laboratorios: FONTES.APPSCRIPT  // Mapa de Laboratórios: 'appscript' ou 'supabase'
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
        try { localStorage.removeItem(chave); } catch (e) {}
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
    // Mapeamento dos tipos para nomes das tabelas no Supabase
    const TABELAS_SUPABASE = {
        salas: 'horarios',              // Tabela de salas/horários
        laboratorios: 'laboratorios'    // Tabela de laboratórios (criar no Supabase)
    };
    
    // Colunas permitidas para cada tipo (apenas dados públicos)
    const COLUNAS_SUPABASE = {
        salas: 'ID,bloco,curso,dia,disciplina,hora,periodo,professor,sala,turno',
        laboratorios: 'ID,bloco,curso,dia,disciplina,hora,periodo,professor,laboratorio,turno,data'
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
        document.getElementById("loading").innerHTML = "<p style='color: white;'>Erro ao carregar os dados.</p>";
        return [];
    }
}

// =================== Inicialização ===================

window.onload = () => {
    document.getElementById("loading").classList.add("hidden");
    document.body.classList.add("loaded");
    document.querySelector(".sectionCenter").style.display = "flex";
};

// =================== Funções de Seleção ===================

function selecionarTipoMapa(tipo) {
    document.getElementById('tipo-mapa-section').classList.add('hidden');
    
    if (tipo === 'sala') {
        document.getElementById('periodo-section').classList.remove('hidden');
    } else {
        document.getElementById('dia-laboratorio-section').classList.remove('hidden');
    }
}

function selecionarPeriodo(periodo) {
    periodoSelecionado = periodo;
    document.getElementById('periodo-section').classList.add('hidden');
    document.getElementById('dia-section').classList.remove('hidden');
}

function selecionarDia(dia) {
    diaSelecionado = dia;
    document.getElementById('dia-section').classList.add('hidden');
    document.getElementById('opcao-section').classList.remove('hidden');
    carregarEMostrarCursos();
}

function selecionarDiaLaboratorio(dia_lab) {
    diaLaboratorioSelecionado = dia_lab;
    document.getElementById('dia-laboratorio-section').classList.add('hidden');
    document.getElementById('turno-section').classList.remove('hidden');
}

function selecionarTurno(turno_lab) {
    turnoLaboratorioSelecionado = turno_lab;
    document.getElementById('turno-section').classList.add('hidden');
    document.getElementById('opcao-section-laboratorio').classList.remove('hidden');
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
        lista.innerHTML = "<p style='color: white'>Nenhum curso encontrado.</p>";
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
    document.getElementById('opcao-section').classList.add('hidden');
    document.getElementById('lista-section').classList.remove('hidden');

    const professoresFiltrados = dados.filter(item => 
        item.curso === curso &&
        item.turno === periodoSelecionado &&
        item.dia === diaSelecionado
    );

    const lista = document.getElementById('lista-professores');
    lista.innerHTML = '';

    if (professoresFiltrados.length === 0) {
        lista.innerHTML = "<p style='color: white'>Nenhum professor encontrado.</p>";
        return;
    }

    professoresFiltrados.forEach(item => {
        const li = document.createElement('li');

        if (typeof item.sala === 'string' && item.sala.trim().toLowerCase() === 'aula cancelada') {
            li.classList.add('cancelado');
        }

        const professorDiv = document.createElement('div');
        professorDiv.textContent = item.professor;
        professorDiv.style.fontWeight = 'bold';

        const detalhesDiv = document.createElement('div');
        detalhesDiv.className = "descricaoDiv";
        detalhesDiv.innerHTML = `Disciplina: ${item.disciplina}<br>
                                Período: ${item.periodo}<br>
                                Bloco: ${item.bloco}<br>
                                Sala: ${item.sala}<br>
                                Hora: ${item.hora}`;
        
        li.appendChild(professorDiv);
        li.appendChild(detalhesDiv);

        lista.appendChild(li);
    });
}

// =================== Exibição Laboratórios ===================

async function carregarEMostrarCursosLaboratorio() {
    // Faz o fetch com os filtros selecionados
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
        lista.innerHTML = "<p style='color: white'>Nenhum curso encontrado.</p>";
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
    document.getElementById('opcao-section-laboratorio').classList.add('hidden');
    document.getElementById('lista-section-laboratorio').classList.remove('hidden');

    const lista = document.getElementById('lista-detalhes-laboratorio');
    lista.innerHTML = '';

    const laboratoriosFiltrados = dadosLaboratorio.filter(lab => 
        lab.curso === curso &&
        lab.dia === diaLaboratorioSelecionado &&
        lab.turno === turnoLaboratorioSelecionado
    );

    if (laboratoriosFiltrados.length === 0) {
        lista.innerHTML = "<p style='color: white'>Nenhum laboratório encontrado.</p>";
        return;
    }

    laboratoriosFiltrados.forEach(item => {
        const li = document.createElement('li');

        if (item.laboratorio.trim().toLowerCase() === 'aula cancelada') {
            li.classList.add('cancelado');
        }

        const professorDiv = document.createElement('div');
        professorDiv.textContent = item.professor;
        professorDiv.style.fontWeight = 'bold';

        const dataFormatada = new Date(item.data).toLocaleDateString("pt-BR");

        const detalhesDiv = document.createElement('div');
        detalhesDiv.className = "descricaoDiv";
        detalhesDiv.innerHTML = `Disciplina: ${item.disciplina} <br>
                                Localização: ${item.laboratorio} <br>
                                Bloco: ${item.bloco} <br>
                                Período: ${item.periodo} <br>
                                Data: ${dataFormatada} <br>
                                Hora: ${item.hora}`;

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
            document.getElementById('tipo-mapa-section').classList.remove('hidden');
            break;

        case 'periodo':
            document.getElementById('dia-section').classList.add('hidden');
            document.getElementById('opcao-section').classList.add('hidden');
            document.getElementById('lista-section').classList.add('hidden');
            document.getElementById('periodo-section').classList.remove('hidden');
            break;

        case 'dia':
            document.getElementById('opcao-section').classList.add('hidden');
            document.getElementById('lista-section').classList.add('hidden');
            document.getElementById('dia-section').classList.remove('hidden');
            break;

        case 'opcao':
            document.getElementById('lista-section').classList.add('hidden');
            document.getElementById('opcao-section').classList.remove('hidden');
            break;

        case 'dia-laboratorio':
            document.getElementById('turno-section').classList.add('hidden');
            document.getElementById('opcao-section-laboratorio').classList.add('hidden');
            document.getElementById('lista-section-laboratorio').classList.add('hidden');
            document.getElementById('dia-laboratorio-section').classList.remove('hidden');
            break;

        case 'turno': 
            document.getElementById('opcao-section-laboratorio').classList.add('hidden');
            document.getElementById('lista-section-laboratorio').classList.add('hidden');
            document.getElementById('turno-section').classList.remove('hidden');
            break;

        case 'opcao-laboratorio': 
            document.getElementById('lista-section-laboratorio').classList.add('hidden');
            document.getElementById('opcao-section-laboratorio').classList.remove('hidden');
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
    const lista = document.getElementById('lista-professores');
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
    const lista = document.getElementById('lista-opcoes-laboratorio');
    const itens = lista.getElementsByTagName('li');

    for (let i = 0; i < itens.length; i++) {
        const itemTexto = itens[i].textContent || itens[i].innerText;
        itens[i].style.display = itemTexto.toLowerCase().includes(filtro) ? '' : 'none';
    }
}

// =================== Tema Claro / Escuro ===================

function toggleTheme() {
    document.body.classList.toggle('light-mode');

    const logoNavbar = document.getElementById('logo-navbar');
    if (document.body.classList.contains('light-mode')) {
        logoNavbar.src = 'images/logo-anhanguera-horizontal.png';
    } else {
        logoNavbar.src = 'images/logo-anhanguera-horizontal-branca.png';
    }
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
