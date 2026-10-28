// =======================================================
// CONFIGURAÇÃO: cole aqui a URL do seu Apps Script publicado
// (Implantar -> Nova implantação -> App da Web -> copiar URL)
// =======================================================
const URL_SCRIPT = "https://script.google.com/macros/s/AKfycbwwbfPMl_PJGJTDS34JYKA2NHTKEfxoUWC55YoqT0176TAP6z5gYEjDDoQthu9ZGkQtew/exec";
 
let experimentos = [];
let avisos = [];
let relatos = [];
let categorias = [];
let configSistema = { modo_inventario: 'inativo', ultimo_inventario_data: '' };
let usuarioLogado = false;
let nomeUsuario = '';
let historico = [];
let filtroAtual = 'todos';
 
// --- MAPEAMENTO DE ELEMENTOS ---
const welcomeScreen = document.getElementById('welcomeScreen');
const authScreen = document.getElementById('authScreen');
const mainApp = document.getElementById('mainApp');
const adminPanel = document.getElementById('adminPanel');
const userStatus = document.getElementById('userStatus');
const grid = document.getElementById('experimentsGrid');
const noticeList = document.getElementById('noticeList');
const searchBar = document.getElementById('searchBar');
 
// --- COMUNICAÇÃO COM A PLANILHA ---
// Faz a requisição e tenta de novo automaticamente se o Google devolver
// uma resposta instável (página HTML de erro em vez de JSON).
async function requisitarComRetry(fazerRequisicao, tentativas = 3) {
    for (let i = 0; i < tentativas; i++) {
        try {
            const resp = await fazerRequisicao();
            const texto = await resp.text();
            const json = JSON.parse(texto); // se vier HTML, cai no catch abaixo
            if (json.erro) throw new Error(json.erro);
            return json;
        } catch (err) {
            const ultimaTentativa = i === tentativas - 1;
            if (ultimaTentativa) throw err;
            await new Promise(r => setTimeout(r, 800 * (i + 1))); // espera um pouco antes de tentar de novo
        }
    }
}

async function buscarDaPlanilha(tipo, forcar) {
    const sufixo = forcar ? '&forcar=1' : '';
    return requisitarComRetry(() => fetch(`${URL_SCRIPT}?tipo=${tipo}${sufixo}`));
}

// Content-Type text/plain evita que o navegador dispare um "preflight" (OPTIONS),
// que o Apps Script não responde corretamente.
let chamadasDeEscritaAtivas = 0;
function definirCarregando(delta) {
    chamadasDeEscritaAtivas += delta;
    document.body.classList.toggle('operacao-em-andamento', chamadasDeEscritaAtivas > 0);
}

async function enviarParaPlanilha(tipo, acao, dados) {
    definirCarregando(1);
    try {
        return await requisitarComRetry(() => fetch(URL_SCRIPT, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ tipo, acao, dados })
        }));
    } finally {
        definirCarregando(-1);
    }
}
 
async function carregarDados(forcar) {
    try {
        grid.innerHTML = '<div class="no-results">Carregando itens...</div>';
        noticeList.innerHTML = '<div style="font-size:14px;">Carregando avisos...</div>';
 
        const [expData, avisosData, relatosData, categoriasData] = await Promise.all([
            buscarDaPlanilha('Experimentos', forcar),
            buscarDaPlanilha('Avisos', forcar),
            buscarDaPlanilha('Relatos', forcar),
            buscarDaPlanilha('Categorias', forcar)
        ]);
 
        experimentos = expData;
        avisos = avisosData;
        relatos = relatosData;
        categorias = categoriasData;
 
        popularSelectCategoriaAddForm();
        aplicarFiltros();
        exibirAvisos();
        if (usuarioLogado) { exibirRelatosPendentes(); exibirRoteirosCadastrados(); recarregarHistorico(); }
    } catch (err) {
        grid.innerHTML = `<div class="no-results">Erro ao carregar dados: ${err.message}</div>`;
        console.error(err);
    }
}

// Atualização leve: só a lista de experimentos. Usada depois de ações rotineiras
// (editar, mudar status, cadastrar) pra não disparar 4 buscas completas a cada clique.
async function recarregarExperimentos() {
    try {
        experimentos = await buscarDaPlanilha('Experimentos', true);
        aplicarFiltros();
        if (usuarioLogado) { exibirRoteirosCadastrados(); recarregarHistorico(); }
    } catch (err) {
        alert("Erro ao atualizar: " + err.message);
    }
}

async function recarregarAvisos() {
    try {
        avisos = await buscarDaPlanilha('Avisos', true);
        exibirAvisos();
    } catch (err) {
        alert("Erro ao atualizar avisos: " + err.message);
    }
}

async function recarregarRelatos() {
    try {
        relatos = await buscarDaPlanilha('Relatos', true);
        if (usuarioLogado) exibirRelatosPendentes();
    } catch (err) {
        alert("Erro ao atualizar relatos: " + err.message);
    }
}
 
const CHAVE_TEMA = 'labrn_tema';

function aplicarTemaSalvo() {
    const temaSalvo = localStorage.getItem(CHAVE_TEMA);
    if (temaSalvo === 'escuro') {
        document.body.classList.add('dark-mode');
        document.getElementById('botaoTema').textContent = '☀️';
    }
}

function alternarTema() {
    const escuro = document.body.classList.toggle('dark-mode');
    document.getElementById('botaoTema').textContent = escuro ? '☀️' : '🌙';
    localStorage.setItem(CHAVE_TEMA, escuro ? 'escuro' : 'claro');
}

aplicarTemaSalvo();
configurarSelectCategoria('expArea', 'expNovaCategoriaBloco');
verificarModoInventario();

// --- CONTROLE DE NAVEGAÇÃO ---
function entrarComoAluno() {
    if (configSistema.modo_inventario === 'ativo') {
        alert("O laboratório está fazendo o inventário físico agora. Tente novamente mais tarde.");
        return;
    }
    usuarioLogado = false;
    welcomeScreen.style.display = 'none';
    mainApp.style.display = 'block';
    adminPanel.style.display = 'none';
    userStatus.innerHTML = "Modo: Leitura (Estudante)";
    carregarDados();
}
 
function mostrarTelaAuth() {
    welcomeScreen.style.display = 'none';
    authScreen.style.display = 'block';
}
 
function voltarParaInicio() {
    usuarioLogado = false;
    nomeUsuario = '';
    authScreen.style.display = 'none';
    mainApp.style.display = 'none';
    welcomeScreen.style.display = 'flex';
    document.getElementById('formLogin').reset();
    document.getElementById('formCadastro').reset();
}
 
function alternarTab(tipo) {
    const tabLogin = document.getElementById('tabLogin');
    const tabCadastro = document.getElementById('tabCadastro');
    const formLogin = document.getElementById('formLogin');
    const formCadastro = document.getElementById('formCadastro');
 
    if (tipo === 'login') {
        tabLogin.classList.add('active');
        tabCadastro.classList.remove('active');
        formLogin.style.display = 'block';
        formCadastro.style.display = 'none';
    } else {
        tabCadastro.classList.add('active');
        tabLogin.classList.remove('active');
        formCadastro.style.display = 'block';
        formLogin.style.display = 'none';
    }
}
 
// --- FLUXOS DE AUTENTICAÇÃO ---
async function executarCadastro(event) {
    event.preventDefault();
    const nome = document.getElementById('cadNome').value.trim();
    const senha = document.getElementById('cadPassword').value;
    const senhaConf = document.getElementById('cadPasswordConfirm').value;
    const chave = document.getElementById('cadChave').value;
 
    if (senha !== senhaConf) { alert("As senhas não coincidem!"); return; }
    if (senha.length < 4) { alert("Use uma senha com pelo menos 4 caracteres."); return; }
 
    const numeroAleatorio = Math.floor(1000000 + Math.random() * 9000000);
    const novoID = "RN" + numeroAleatorio;
 
    try {
        await enviarParaPlanilha('Professores', 'cadastrar', { id: novoID, nome, senha, chave });
        alert(`Cadastrado com sucesso!\n\nSEU ID DE ACESSO: ${novoID}\n\nGuarde esse ID e sua senha, eles serão necessários pra entrar no painel.`);
        document.getElementById('loginId').value = novoID;
        document.getElementById('formCadastro').reset();
        alternarTab('login');
    } catch (err) {
        alert("Erro ao cadastrar: " + err.message);
    }
}
 
async function executarLogin(event) {
    event.preventDefault();
    const id = document.getElementById('loginId').value.trim().toUpperCase();
    const senha = document.getElementById('loginPassword').value;
 
    try {
        const resultado = await enviarParaPlanilha('Professores', 'login', { id, senha });
        if (resultado.autorizado) {
            usuarioLogado = true;
            nomeUsuario = resultado.nome || '';
            authScreen.style.display = 'none';
            welcomeScreen.style.display = 'none';
            mainApp.style.display = 'block';
            adminPanel.style.display = 'block';
            userStatus.innerHTML = `Modo Administrativo (${resultado.nome})`;
            exibirPainelModoInventario();
            carregarDados();
        } else {
            alert("ID ou senha incorretos.");
        }
    } catch (err) {
        alert("Erro ao entrar: " + err.message);
    }
}
 
function popularSelectCategoriaAddForm() {
    const select = document.getElementById('expArea');
    if (!select) return;
    select.innerHTML = `<option value="">Selecione a Categoria...</option>` + opcoesDeCategoria('');
}

// --- MODO INVENTÁRIO (bloqueia consulta pública durante a contagem física) ---
async function verificarModoInventario() {
    try {
        configSistema = await buscarDaPlanilha('Config');
    } catch (err) {
        console.error('Erro ao checar modo inventário:', err);
        return;
    }

    const aviso = document.getElementById('avisoInventario');
    const btnAluno = document.getElementById('btnSouAluno');
    if (!aviso || !btnAluno) return;

    if (configSistema.modo_inventario === 'ativo') {
        aviso.style.display = 'block';
        aviso.innerHTML = `<div style="background:#fdedec; color:#c0392b; padding:12px 16px; border-radius:8px; margin-bottom:16px; font-size:14px;">
            🔒 O laboratório está fazendo o inventário físico agora. A consulta de estudante fica temporariamente indisponível.
        </div>`;
        btnAluno.disabled = true;
        btnAluno.style.opacity = '0.5';
        btnAluno.style.cursor = 'not-allowed';
    } else {
        aviso.style.display = 'none';
        btnAluno.disabled = false;
        btnAluno.style.opacity = '1';
        btnAluno.style.cursor = 'pointer';
    }
}

function exibirPainelModoInventario() {
    const painel = document.getElementById('painelModoInventario');
    if (!painel) return;

    if (configSistema.modo_inventario === 'ativo') {
        painel.innerHTML = `
            <p style="font-size:13px; color:#c0392b; font-weight:600;">🔒 Inventário em andamento — consulta de estudante está bloqueada.</p>
            <button class="btn-admin-action" onclick="encerrarModoInventario()">✅ Encerrar Inventário</button>
            <button class="btn-icon btn-icon-excluir" style="width:100%; margin-top:8px; padding:8px;" onclick="cancelarModoInventario()">❌ Cancelar Inventário</button>
        `;
    } else {
        const ultimaData = configSistema.ultimo_inventario_data
            ? `<p style="font-size:12px; color:#7f8c8d;">Último inventário concluído em: ${configSistema.ultimo_inventario_data}</p>`
            : '';
        painel.innerHTML = `
            <p style="font-size:13px; color:#7f8c8d;">Ative pra bloquear a consulta pública enquanto vocês conferem o inventário físico.</p>
            ${ultimaData}
            <button class="btn-admin-action" onclick="ativarModoInventario()">🔒 Iniciar Inventário</button>
        `;
    }
}

async function ativarModoInventario() {
    const chave = prompt("Digite a chave mestra do laboratório pra confirmar:");
    if (chave === null) return;

    try {
        await enviarParaPlanilha('Config', 'ativarInventario', { chave });
        await verificarModoInventario();
        exibirPainelModoInventario();
        aplicarFiltros();
        alert("Modo Inventário ativado. A consulta de estudante está bloqueada até você encerrar.");
    } catch (err) {
        alert("Erro ao ativar: " + err.message);
    }
}

async function encerrarModoInventario() {
    if (!confirm("Confirma que o inventário foi concluído? Isso libera a consulta de estudante de novo.")) return;

    const hoje = new Date();
    const dataFormatada = `${String(hoje.getDate()).padStart(2, '0')}/${String(hoje.getMonth() + 1).padStart(2, '0')}/${hoje.getFullYear()}`;

    try {
        await enviarParaPlanilha('Config', 'encerrarInventario', { data: dataFormatada });
        await verificarModoInventario();
        exibirPainelModoInventario();
        aplicarFiltros();
    } catch (err) {
        alert("Erro ao encerrar: " + err.message);
    }
}

async function cancelarModoInventario() {
    if (!confirm("Cancelar o Modo Inventário sem registrar conclusão?")) return;

    try {
        await enviarParaPlanilha('Config', 'cancelarInventario', {});
        await verificarModoInventario();
        exibirPainelModoInventario();
        aplicarFiltros();
    } catch (err) {
        alert("Erro ao cancelar: " + err.message);
    }
}


// --- CATEGORIAS DINÂMICAS (cor customizada por categoria) ---
function corCategoria(nomeArea) {
    const cat = categorias.find(c => (c.nome || '').toLowerCase() === (nomeArea || '').toLowerCase());
    return cat ? cat.cor : '#7f8c8d'; // cinza como cor padrão pra categoria não encontrada
}

// Monta as <option> de um select de categoria, incluindo a opção de criar uma nova
function opcoesDeCategoria(valorAtual) {
    const opcoes = categorias.map(c =>
        `<option value="${c.nome}" ${c.nome === valorAtual ? 'selected' : ''}>${c.nome}</option>`
    ).join('');
    return opcoes + `<option value="__nova__">➕ Criar nova categoria...</option>`;
}

// Liga o comportamento de "mostrar campos de nova categoria" quando o select muda
function configurarSelectCategoria(idSelect, idBlocoNovaCategoria) {
    const select = document.getElementById(idSelect);
    const bloco = document.getElementById(idBlocoNovaCategoria);
    if (!select || !bloco) return;
    select.addEventListener('change', () => {
        bloco.style.display = select.value === '__nova__' ? 'block' : 'none';
    });
}

// Se o select estiver em "criar nova categoria", cria ela na planilha e devolve o nome final a usar
async function resolverCategoriaEscolhida(idSelect, idNomeNova, idCorNova) {
    const select = document.getElementById(idSelect);
    if (select.value !== '__nova__') return select.value;

    const nome = document.getElementById(idNomeNova).value.trim();
    const cor = document.getElementById(idCorNova).value;
    if (!nome) { throw new Error("Digite um nome pra nova categoria."); }

    await enviarParaPlanilha('Categorias', 'adicionar', { nome, cor });
    categorias.push({ nome, cor }); // já disponibiliza localmente, sem esperar recarregar
    return nome;
}

// --- RENDERS ---
// Escapa texto para uso seguro em HTML e dentro de atributos (ex: value="...", alt="...")
function escAttr(t) {
    return String(t == null ? '' : t).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
const esc = escAttr;

// --- AGRUPAMENTO (uma linha da planilha = uma unidade física; reagente = um frasco) ---
function chaveDoGrupo(exp) {
    // A chave é usada em atributos onclick="..." — por isso removemos aspas, <, >, &
    // e barras invertidas, que quebrariam o HTML (ex: nomes com 6" de polegadas).
    const norm = (t) => (t || '').toString().toLowerCase()
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .replace(/["'`<>&\\]/g, "")
        .replace(/\s+/g, ' ').trim();
    return norm(exp.nome) + '||' + norm(exp.area);
}

// Ordem de gravidade (equipamentos): o card agrupado mostra sempre o status mais crítico do grupo
const PRIORIDADE_STATUS = ['Com Defeito', 'Em Reparo', 'Desativado', 'Ativo'];

function agruparExperimentos(lista) {
    const mapa = new Map();
    lista.forEach(exp => {
        const chave = chaveDoGrupo(exp);
        if (!mapa.has(chave)) mapa.set(chave, { ...exp, unidades: [] });
        mapa.get(chave).unidades.push(exp);
    });

    return Array.from(mapa.values()).map(grupo => {
        const statusDasUnidades = grupo.unidades.map(u => u.status || 'Ativo');
        const statusResumo = PRIORIDADE_STATUS.find(s => statusDasUnidades.includes(s)) || 'Ativo';
        const contagem = {};
        statusDasUnidades.forEach(s => { contagem[s] = (contagem[s] || 0) + 1; });
        return { ...grupo, statusResumo, contagem, linhas: grupo.unidades.map(u => u.linha) };
    });
}

function seloDeStatus(status) {
    if (status === 'Em Reparo') return `<span class="status-badge status-reparo">🛠️ Em Reparo</span>`;
    if (status === 'Com Defeito') return `<span class="status-badge status-defeito">⚠️ Com Defeito</span>`;
    if (status === 'Desativado') return `<span class="status-badge status-desativado">🚫 Desativado</span>`;
    return `<span class="status-badge status-ativo">✅ Ativo</span>`;
}

function montarMiniatura(exp) {
    if (!exp.imagem_url) return '';
    return `<img src="${escAttr(exp.imagem_url)}" alt="${escAttr(exp.nome)}" class="card-thumb" onerror="this.style.display='none';">`;
}

// =======================================================
// REAGENTES: volume, validade, estoque e perigo
// =======================================================
const DIAS_ALERTA_VALIDADE = 30;
const FATOR_UNIDADE = { 'ml': 1, 'l': 1000, 'g': 1, 'kg': 1000 };

function ehReagente(e) { return !!e && e.tipo === 'Reagente'; }
function fatorUnidade(un) { return FATOR_UNIDADE[String(un || '').toLowerCase()] || 1; }
function familiaUnidade(un) {
    const u = String(un || '').toLowerCase();
    return (u === 'g' || u === 'kg') ? 'massa' : 'volume';
}
function fmtNum(n) {
    const x = Number(n);
    if (!isFinite(x)) return '0';
    return x.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}
function fmtQtd(n, un) { return (fmtNum(n) + ' ' + (un || '')).trim(); }

// Dias entre hoje e a validade (negativo = já venceu). null se não tem validade.
function diasAteValidade(iso) {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const venc = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    return Math.round((venc - hoje) / 86400000);
}
function mesAno(iso) {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[2]}/${m[1]}` : '';
}
function dataBR(iso) {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}
// Cor da barra: verde acima de 60%, amarela de 20 a 60%, vermelha abaixo de 20%
function classeNivel(pct) { return pct > 60 ? 'g' : (pct >= 20 ? 'y' : 'r'); }

function converterParaUnidade(valor, unidadeOrigem, unidadeDestino) {
    const v = Number(valor) || 0;
    if (familiaUnidade(unidadeOrigem) !== familiaUnidade(unidadeDestino)) return v;
    return v * fatorUnidade(unidadeOrigem) / fatorUnidade(unidadeDestino);
}

// Resume um grupo de frascos do mesmo reagente. Frascos descartados e vazios não entram na validade.
function resumoReagente(unidades, usarEstoqueMin) {
    const ativos = unidades.filter(u => u.status !== 'Descartado');
    const ref = ativos[0] || unidades[0];
    const un = ref.unidade || '';
    let atual = 0, capacidade = 0, minimo = 0;
    const comLiquido = ativos.filter(u => Number(u.volume_atual) > 0);
    const baseCapacidade = comLiquido.length ? comLiquido : ativos; // frasco vazio não entra na barra
    ativos.forEach(u => {
        atual += converterParaUnidade(u.volume_atual, u.unidade, un);
        minimo = Math.max(minimo, converterParaUnidade(u.estoque_min, u.unidade, un));
    });
    baseCapacidade.forEach(u => { capacidade += converterParaUnidade(u.volume_frasco, u.unidade, un); });
    atual = Math.round(atual * 1e6) / 1e6;

    let proxima = null, vencidos = 0;
    ativos.filter(u => Number(u.volume_atual) > 0).forEach(u => {
        const d = diasAteValidade(u.validade);
        if (d === null) return;
        if (d < 0) vencidos++;
        if (proxima === null || d < proxima.dias) proxima = { dias: d, iso: u.validade, linha: u.linha };
    });

    const estoqueMin = usarEstoqueMin === false ? 0 : minimo;
    return {
        ativos, unidade: un, atual, capacidade,
        pct: capacidade > 0 ? Math.min(100, atual / capacidade * 100) : 0,
        proxima, vencidos, estoqueMin,
        baixo: atual > 0 && estoqueMin > 0 && atual < estoqueMin,
        semEstoque: ativos.length > 0 && atual <= 0,
        todosDescartados: ativos.length === 0
    };
}

function selosReagente(r) {
    if (r.todosDescartados) return `<span class="status-badge status-desativado">🗑️ Descartado</span>`;
    const selos = [];
    if (r.vencidos > 0) {
        selos.push(`<span class="status-badge status-defeito">⛔ ${r.vencidos} frasco${r.vencidos > 1 ? 's' : ''} vencido${r.vencidos > 1 ? 's' : ''}</span>`);
    } else if (r.proxima && r.proxima.dias <= DIAS_ALERTA_VALIDADE) {
        const d = r.proxima.dias;
        selos.push(`<span class="status-badge status-reparo">⏳ ${d === 0 ? 'Vence hoje' : `Vence em ${d} dia${d > 1 ? 's' : ''}`}</span>`);
    }
    if (r.semEstoque) selos.push(`<span class="status-badge status-defeito">📉 Sem estoque</span>`);
    else if (r.baixo) selos.push(`<span class="status-badge status-defeito">📉 Estoque baixo</span>`);
    if (selos.length === 0) selos.push(`<span class="status-badge status-ativo">✅ Em estoque</span>`);
    return selos.join('');
}

function chipValidade(u) {
    if (u.status === 'Descartado') return `<span class="val val-cinza">descartado</span>`;
    if (!(Number(u.volume_atual) > 0)) return `<span class="val val-cinza">vazio</span>`;
    if (!u.validade) return `<span class="val val-cinza">sem validade</span>`;
    const d = diasAteValidade(u.validade);
    const cls = d < 0 ? 'val-bad' : (d <= DIAS_ALERTA_VALIDADE ? 'val-warn' : 'val-ok');
    return `<span class="val ${cls}">${d < 0 ? 'vencido ' : ''}${mesAno(u.validade)}</span>`;
}

// Frasco vazio: não descartado e sem líquido. Sai da lista principal e vai para o filtro "Vazios".
function frascoVazio(u) { return u.status !== 'Descartado' && !(Number(u.volume_atual) > 0); }

// Ordem: com líquido (validade mais próxima primeiro, sem validade por último), depois vazios, depois descartados
function ordenarFrascos(unidades) {
    const grupo = u => u.status === 'Descartado' ? 2 : (frascoVazio(u) ? 1 : 0);
    const dias = u => { const d = diasAteValidade(u.validade); return d === null ? Infinity : d; };
    return unidades.slice().sort((a, b) =>
        grupo(a) - grupo(b) ||
        (dias(a) === dias(b) ? 0 : (dias(a) < dias(b) ? -1 : 1)) ||
        a.linha - b.linha);
}

function linhaFrasco(u, indice) {
    const cheio = Number(u.volume_frasco) || 0;
    const pct = cheio > 0 ? Math.max(0, Math.min(100, Number(u.volume_atual) / cheio * 100)) : 0;
    const local = u.localizacao ? ` · ${esc(u.localizacao)}` : '';
    return `<div class="linha-frasco${u.status === 'Descartado' ? ' frasco-descartado' : ''}">
        <span class="lf-nome">Frasco ${indice}${local}</span>
        <span class="lf-barra"><i class="${classeNivel(pct)}" style="width:${pct}%"></i></span>
        <span class="lf-vol">${fmtNum(u.volume_atual)} / ${fmtNum(u.volume_frasco)} ${esc(u.unidade)}</span>
        ${chipValidade(u)}
    </div>`;
}

function listaPerigos(unidades) {
    const set = new Set();
    unidades.forEach(u => String(u.perigo || '').split(',').map(p => p.trim()).filter(Boolean).forEach(p => set.add(p)));
    return Array.from(set);
}

// Etiquetas: perigo, próxima validade, mínimo e link da FDS (a FDS é segurança: todos podem abrir)
function tagsReagente(unidades, r) {
    const tags = [];
    listaPerigos(unidades).forEach(p => tags.push(`<span class="tag tag-perigo">${esc(p)}</span>`));
    if (r.proxima) {
        const idx = unidades.findIndex(u => u.linha === r.proxima.linha) + 1;
        tags.push(`<span class="tag">Próxima validade: ${mesAno(r.proxima.iso)}${unidades.length > 1 && idx ? ` (frasco ${idx})` : ''}</span>`);
    }
    if (r.estoqueMin > 0) tags.push(`<span class="tag">Mínimo: ${fmtQtd(r.estoqueMin, r.unidade)}</span>`);
    const comFds = unidades.find(u => u.manual_url);
    if (comFds) tags.push(`<a class="tag tag-fds" href="${escAttr(comFds.manual_url)}" target="_blank" rel="noopener" onclick="event.stopPropagation();">FDS ↗</a>`);
    return `<div class="tags">${tags.join('')}</div>`;
}

function blocoTotalReagente(unidades, r) {
    if (r.todosDescartados) return '';
    return `<div class="rg-total"><span>TOTAL (${unidades.length} frasco${unidades.length > 1 ? 's' : ''})</span>
            <b>${fmtNum(r.atual)} ${esc(r.unidade)} <small>de ${fmtNum(r.capacidade)} ${esc(r.unidade)}</small></b></div>
            <div class="rg-barra"><i class="${classeNivel(r.pct)}" style="width:${r.pct}%"></i></div>`;
}

function precisaAtencao(item, modoInventario) {
    if (ehReagente(item)) {
        const r = resumoReagente(item.unidades, !modoInventario);
        if (r.todosDescartados) return false;
        return r.vencidos > 0 || r.baixo || r.semEstoque || (r.proxima && r.proxima.dias <= DIAS_ALERTA_VALIDADE);
    }
    return item.unidades.some(u => u.status === 'Com Defeito' || u.status === 'Em Reparo');
}

function exibirExperimentos(lista) {
    grid.innerHTML = '';
    const modoInventario = configSistema.modo_inventario === 'ativo';

    // No modo inventário cada unidade física (frasco) aparece sozinha; fora dele, agrupa por nome
    let itens = modoInventario
        ? lista.map(exp => ({ ...exp, unidades: [exp], linhas: [exp.linha], statusResumo: exp.status || 'Ativo', contagem: {} }))
        : agruparExperimentos(lista);

    const verVazios = filtroAtual === 'vazios';
    if (verVazios) {
        // Só reagentes que têm frasco vazio; o card mostra apenas os frascos vazios
        itens = itens.filter(it => ehReagente(it) && it.unidades.some(frascoVazio))
            .map(it => ({ ...it, unidades: it.unidades.filter(frascoVazio), linhas: it.unidades.filter(frascoVazio).map(u => u.linha) }));
    } else {
        // Frascos vazios saem da lista principal; reagente sem nenhum frasco com líquido sai junto
        itens = itens.map(it => {
            if (!ehReagente(it)) return it;
            const vazios = it.unidades.filter(frascoVazio).length;
            const restantes = ordenarFrascos(it.unidades.filter(u => !frascoVazio(u)));
            return { ...it, unidades: restantes, vaziosOcultos: vazios };
        }).filter(it => !ehReagente(it) || it.unidades.length > 0);
    }

    if (filtroAtual === 'atencao') {
        itens = itens.filter(it => precisaAtencao(it, modoInventario));
        // O mais urgente primeiro: validade mais próxima
        const urgencia = it => {
            if (!ehReagente(it)) return Infinity;
            const r = resumoReagente(it.unidades, !modoInventario);
            return r.proxima ? r.proxima.dias : Infinity;
        };
        itens.sort((a, b) => urgencia(a) - urgencia(b));
    }

    if (itens.length === 0) {
        const msg = filtroAtual === 'atencao' ? 'Nada precisa de atenção agora. 👍'
            : (verVazios ? 'Nenhum frasco vazio. 👍' : 'Nenhum item encontrado.');
        grid.innerHTML = `<div class="no-results">${msg}</div>`;
        return;
    }

    itens.forEach(item => {
        const reag = ehReagente(item);
        const card = document.createElement('div');
        const cor = corCategoria(item.area);
        const qtd = item.unidades.length;
        const resumo = reag ? resumoReagente(item.unidades, !modoInventario) : null;
        const statusExibido = modoInventario ? (item.status || 'Ativo') : item.statusResumo;
        const desativado = reag ? resumo.todosDescartados : statusExibido === 'Desativado';

        card.className = `card card-clicavel${desativado ? ' card-desativado' : ''}`;
        card.style.borderTopColor = cor;
        card.onclick = () => modoInventario
            ? abrirModalExperimento(item.linha)
            : abrirModalGrupo(chaveDoGrupo(item));

        const iconeManual = (!reag && item.manual_url)
            ? `<a href="${escAttr(item.manual_url)}" target="_blank" rel="noopener" class="btn-icon" title="Abrir manual" onclick="event.stopPropagation();">📄</a>` : '';
        const acoesAdmin = usuarioLogado ? `
            <div class="card-header-actions">
                ${iconeManual}
                <button class="btn-icon btn-icon-excluir" onclick="event.stopPropagation(); ${verVazios ? `removerVazios('${chaveDoGrupo(item)}')` : (modoInventario ? `removerExperimento(${item.linha})` : `removerGrupo('${chaveDoGrupo(item)}')`)}" title="${verVazios ? 'Remover os frascos vazios' : (modoInventario ? 'Remover este item' : 'Remover todos os itens deste grupo')}">🗑️</button>
            </div>
        ` : '';

        let selos, corpo;
        if (reag) {
            selos = selosReagente(resumo);
            const frascos = item.unidades.slice(0, 4).map((u, i) => linhaFrasco(u, i + 1)).join('');
            const maisVisiveis = qtd > 4 ? `+ ${qtd - 4} frasco(s) — clique para ver todos` : '';
            const ocultos = (!verVazios && item.vaziosOcultos) ? `🫙 ${item.vaziosOcultos} frasco(s) vazio(s) — veja em "Vazios"` : '';
            const mais = [maisVisiveis, ocultos].filter(Boolean).map(t => `<div class="mais-frascos">${t}</div>`).join('');
            corpo = `
                ${blocoTotalReagente(item.unidades, resumo)}
                <div class="frascos">${frascos}${mais}</div>
                ${tagsReagente(item.unidades, resumo)}
                ${item.componentes ? `<p class="info-item"><span class="info-label">Obs.:</span> ${esc(item.componentes)}</p>` : ''}
            `;
        } else {
            // No modo inventário o patrimônio vira selo, do lado do status
            const seloPatrimonio = modoInventario
                ? `<span class="status-badge status-patrimonio">🏷️ ${esc(item.patrimonio) || 'sem nº'}</span>` : '';
            selos = seloPatrimonio + seloDeStatus(statusExibido);
            let linhaQuantidade = '';
            if (!modoInventario && qtd > 1) {
                const problemas = (item.contagem['Com Defeito'] || 0) + (item.contagem['Em Reparo'] || 0);
                linhaQuantidade = `<p class="info-item"><span class="info-label">Unidades:</span> ${qtd}${problemas ? ` <span style="color:#c0392b;">(${problemas} com problema)</span>` : ''}</p>`;
            }
            corpo = `
                ${linhaQuantidade}
                ${item.capacidade ? `<p class="info-item"><span class="info-label">Capacidade:</span> ${esc(item.capacidade)}</p>` : ''}
                <p class="info-item"><span class="info-label">Localização:</span> ${esc(item.localizacao) || 'Não cadastrada'}</p>
                <p class="info-item"><span class="info-label">Observações:</span> ${esc(item.componentes) || '—'}</p>
            `;
        }

        card.innerHTML = `
            ${montarMiniatura(item)}
            <div>
                ${acoesAdmin}
                <div class="card-top-row">
                    <div class="card-titulo">
                        <h3>${esc(item.nome)}</h3>
                        <div class="card-cat" style="color:${cor};">${esc(item.area) || 'Sem categoria'}</div>
                    </div>
                    <span class="card-selos">${selos}</span>
                </div>
                ${corpo}
            </div>
        `;
        grid.appendChild(card);
    });
}

// --- FILTROS E BUSCA ---
function aplicarFiltros() {
    const termo = (searchBar ? searchBar.value : '').toLowerCase().trim();
    let lista = experimentos;
    if (filtroAtual === 'reagente') lista = lista.filter(ehReagente);
    if (filtroAtual === 'equipamento') lista = lista.filter(e => !ehReagente(e));
    if (termo) {
        lista = lista.filter(e => [e.nome, e.area, e.localizacao, e.perigo, e.lote]
            .some(c => String(c || '').toLowerCase().includes(termo)));
    }
    exibirExperimentos(lista);
    const chip = document.getElementById('chipVazios');
    if (chip) {
        const n = experimentos.filter(e => ehReagente(e) && frascoVazio(e)).length;
        chip.textContent = `🫙 Vazios${n ? ` (${n})` : ''}`;
    }
}

function definirFiltro(filtro) {
    filtroAtual = filtro;
    document.querySelectorAll('.filtro-chip').forEach(b => b.classList.toggle('ativo', b.dataset.filtro === filtro));
    aplicarFiltros();
}


function exibirAvisos() {
    noticeList.innerHTML = '';
    if (avisos.length === 0) {
        noticeList.innerHTML = '<div style="color:#856404; font-size:14px;">Nenhum aviso no mural.</div>';
        return;
    }
 
    avisos.forEach(av => {
        const item = document.createElement('div');
        item.className = 'notice-item';
 
        let botaoDeletarAviso = usuarioLogado ? `<button class="btn-delete" style="margin:0;" onclick="removerAviso(${av.linha})">Deletar</button>` : '';
 
        item.innerHTML = `
            <div><strong>[${av.data}] ${av.autor}:</strong> ${av.texto}</div>
            ${botaoDeletarAviso}
        `;
        noticeList.appendChild(item);
    });
}
 
// --- OPERAÇÕES ADMINISTRATIVAS (ITENS) ---
// Mostra os campos certos no formulário conforme o tipo (reagente ou equipamento)
function sincronizarFormTipo() {
    const sel = document.getElementById('expTipo');
    if (!sel) return;
    const reag = sel.value === 'Reagente';
    document.getElementById('blocoReagente').style.display = reag ? 'block' : 'none';
    document.getElementById('blocoEquipamento').style.display = reag ? 'none' : 'block';
    document.getElementById('rotuloQuantidade').textContent = reag ? 'Quantos frascos iguais' : 'Quantas unidades iguais';
}

async function adicionarExperimentoNoGrid(event) {
    event.preventDefault();
    const tipo = document.getElementById('expTipo').value;
    const reag = tipo === 'Reagente';
    const nome = document.getElementById('expNome').value.trim();
    const localizacao = document.getElementById('expLocal').value;
    const componentes = document.getElementById('expComp').value;
    const quantidade = parseInt(document.getElementById('expQuantidade').value, 10) || 1;

    const dados = { tipo, nome, localizacao, componentes, quantidade, usuario: nomeUsuario };

    if (reag) {
        const volumeFrasco = parseFloat(document.getElementById('expVolFrasco').value);
        if (!(volumeFrasco > 0)) { alert("Informe o volume do frasco (maior que zero)."); return; }
        Object.assign(dados, {
            volume_frasco: volumeFrasco,
            unidade: document.getElementById('expUnidade').value,
            validade: document.getElementById('expValidade').value,   // aaaa-mm-dd ou vazio
            lote: document.getElementById('expLote').value.trim(),
            perigo: document.getElementById('expPerigo').value.trim(),
            estoque_min: parseFloat(document.getElementById('expEstoqueMin').value) || ''
        });
    } else {
        Object.assign(dados, {
            capacidade: document.getElementById('expCapacidade').value.trim(),
            patrimonio: document.getElementById('expPatrimonio').value.trim()
        });
    }

    try {
        dados.area = await resolverCategoriaEscolhida('expArea', 'expNovaCategoriaNome', 'expNovaCategoriaCor');
        await enviarParaPlanilha('Experimentos', 'adicionar', dados);
        document.getElementById('formNovoExperimento').reset();
        document.getElementById('expNovaCategoriaBloco').style.display = 'none';
        sincronizarFormTipo();
        await recarregarExperimentos();
        popularSelectCategoriaAddForm();
    } catch (err) {
        alert("Erro ao salvar item: " + err.message);
    }
}

async function removerExperimento(linha) {
    if (!confirm("Tem certeza que deseja remover este item do inventário?")) return;
    try {
        await enviarParaPlanilha('Experimentos', 'remover', { linha, usuario: nomeUsuario });
        await recarregarExperimentos();
    } catch (err) {
        alert("Erro ao remover item: " + err.message);
    }
}

// --- OPERAÇÕES ADMINISTRATIVAS (AVISOS) ---
async function adicionarAvisoNoMural(event) {
    event.preventDefault();
    const autor = document.getElementById('avisoAutor').value;
    const texto = document.getElementById('avisoTexto').value;
 
    const hoje = new Date();
    const dataFormatada = `${String(hoje.getDate()).padStart(2, '0')}/${String(hoje.getMonth() + 1).padStart(2, '0')}/${hoje.getFullYear()}`;
 
    try {
        await enviarParaPlanilha('Avisos', 'adicionar', { autor, texto, data: dataFormatada });
        document.getElementById('formNovoAviso').reset();
        await recarregarAvisos();
    } catch (err) {
        alert("Erro ao publicar aviso: " + err.message);
    }
}
 
async function removerAviso(linha) {
    if (!confirm("Deseja apagar esse aviso do mural?")) return;
    try {
        await enviarParaPlanilha('Avisos', 'remover', { linha });
        await recarregarAvisos();
    } catch (err) {
        alert("Erro ao remover aviso: " + err.message);
    }
}
 

// --- MODAL DE GRUPO (card agrupado, fora do modo inventário) ---
function abrirModalGrupo(chave) {
    const unidades = experimentos.filter(e => chaveDoGrupo(e) === chave);
    if (unidades.length === 0) return;
    if (ehReagente(unidades[0])) { abrirModalGrupoReagente(chave, unidades); return; }

    const ref = unidades[0]; // representante do grupo (campos compartilhados)
    const modalOverlay = document.getElementById('modalOverlay');
    const modalConteudo = document.getElementById('modalConteudo');

    const listaUnidades = unidades.map(u => `
        <div class="modal-relato-item" style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
            <span>🏷️ ${esc(u.patrimonio) || '<em style="color:#7f8c8d;">sem nº</em>'}</span>
            ${seloDeStatus(u.status || 'Ativo')}
        </div>
    `).join('');

    if (usuarioLogado) {
        const opcoesArea = opcoesDeCategoria(ref.area);
        modalConteudo.innerHTML = `
            <button class="modal-fechar" onclick="fecharModal()">✕</button>
            <h3>${esc(ref.nome)}</h3>
            <p style="font-size:13px; color:#7f8c8d; margin-top:-8px;">${unidades.length} unidade(s) cadastrada(s)</p>

            <div class="form-group">
                <label for="grupoEditNome">Nome do item</label>
                <input type="text" id="grupoEditNome" value="${esc(ref.nome)}">
            </div>
            <div class="form-group">
                <label for="grupoEditArea">Categoria</label>
                <select id="grupoEditArea">${opcoesArea}</select>
            </div>
            <div class="form-group" id="grupoNovaCategoriaBloco" style="display:none;">
                <label for="grupoNovaCategoriaNome">Nome da nova categoria</label>
                <input type="text" id="grupoNovaCategoriaNome" placeholder="Ex: Vidraria">
                <label for="grupoNovaCategoriaCor" style="margin-top:6px;">Cor da categoria</label>
                <input type="color" id="grupoNovaCategoriaCor" value="#3498db" style="height:38px; padding:2px;">
            </div>
            <div class="form-group">
                <label for="grupoEditCapacidade">Capacidade (ex.: 100 mL)</label>
                <input type="text" id="grupoEditCapacidade" value="${esc(ref.capacidade)}">
            </div>
            <div class="form-group">
                <label for="grupoEditLocal">Localização</label>
                <input type="text" id="grupoEditLocal" value="${esc(ref.localizacao)}">
            </div>
            <div class="form-group">
                <label for="grupoEditComp">Observações</label>
                <input type="text" id="grupoEditComp" value="${esc(ref.componentes)}">
            </div>
            <div class="form-group">
                <label for="grupoEditImagem">Link da imagem (Google Drive)</label>
                <input type="text" id="grupoEditImagem" value="${esc(ref.imagem_url)}">
            </div>
            <div class="form-group">
                <label for="grupoEditManual">Link do manual — visível só para professores</label>
                <input type="text" id="grupoEditManual" value="${esc(ref.manual_url)}">
            </div>
            <div class="form-group">
                <label for="grupoEditRoteiro">Link do roteiro</label>
                <input type="text" id="grupoEditRoteiro" value="${esc(ref.roteiro_url)}">
            </div>
            <p style="font-size:12px; color:#7f8c8d;">Salvar aplica estes campos a todas as ${unidades.length} unidade(s). Status e patrimônio são editados individualmente no Modo Inventário.</p>
            <button class="btn-admin-action" onclick="salvarEdicaoGrupo('${chave}')">Salvar alterações</button>

            <div class="modal-secao">
                <h4>Unidades deste item</h4>
                ${listaUnidades}
            </div>
        `;
        configurarSelectCategoria('grupoEditArea', 'grupoNovaCategoriaBloco');
    } else {
        const blocoImagem = ref.imagem_url
            ? `<img src="${escAttr(ref.imagem_url)}" alt="${escAttr(ref.nome)}" style="width:100%; border-radius:8px; margin-bottom:14px;" onerror="this.style.display='none'">`
            : '';
        modalConteudo.innerHTML = `
            <button class="modal-fechar" onclick="fecharModal()">✕</button>
            <h3>${esc(ref.nome)}</h3>
            ${blocoImagem}
            <p class="info-item"><span class="info-label">Categoria:</span> ${esc(ref.area) || 'Não definida'}</p>
            ${ref.capacidade ? `<p class="info-item"><span class="info-label">Capacidade:</span> ${esc(ref.capacidade)}</p>` : ''}
            <p class="info-item"><span class="info-label">Localização:</span> ${esc(ref.localizacao) || 'Não cadastrada'}</p>
            <p class="info-item"><span class="info-label">Observações:</span> ${esc(ref.componentes) || '—'}</p>
            <p class="info-item"><span class="info-label">Unidades:</span> ${unidades.length}</p>

            <div class="modal-secao">
                <h4>Situação das unidades</h4>
                ${listaUnidades}
            </div>

            <div class="modal-secao">
                <div class="form-group">
                    <label for="modalRelatoTexto">Reportar problema com este item</label>
                    <textarea id="modalRelatoTexto" rows="3" placeholder="Descreva o que você percebeu (informe o nº de patrimônio, se souber)..."></textarea>
                    <button class="btn-admin-action" style="margin-top:8px;" onclick="reportarProblema(${ref.linha})">Enviar relato</button>
                </div>
            </div>
        `;
    }

    modalOverlay.style.display = 'flex';
}

// Modal do grupo de frascos de um reagente
function abrirModalGrupoReagente(chave, unidades) {
    unidades = ordenarFrascos(unidades);
    const ref = unidades[0];
    const r = resumoReagente(unidades);
    const modalOverlay = document.getElementById('modalOverlay');
    const modalConteudo = document.getElementById('modalConteudo');

    const cabecalho = `
        <button class="modal-fechar" onclick="fecharModal()">✕</button>
        <h3>${esc(ref.nome)}</h3>
        <div class="selos-linha">${selosReagente(r)}</div>
        ${blocoTotalReagente(unidades, r)}
        ${tagsReagente(unidades, r)}
    `;

    if (usuarioLogado) {
        const frascos = unidades.map((u, i) => `
            <div class="frasco-admin">
                ${linhaFrasco(u, i + 1)}
                <div class="frasco-acoes">
                    ${u.lote ? `<span class="tag">Lote ${esc(u.lote)}</span>` : ''}
                    ${u.status !== 'Descartado' ? `<button class="btn-admin-action btn-mini" onclick="abrirModalUso(${u.linha}, '${chave}')">💧 Registrar uso</button>` : ''}
                    <button class="btn-icon" onclick="abrirModalExperimento(${u.linha})">✏️ Editar frasco</button>
                </div>
            </div>
        `).join('');

        modalConteudo.innerHTML = `
            ${cabecalho}
            <div class="modal-secao">
                <h4>Frascos (${unidades.length})</h4>
                ${frascos}
            </div>

            <div class="modal-secao">
                <h4>Dados do reagente (valem para todos os frascos)</h4>
                <div class="form-group">
                    <label for="grupoEditNome">Nome</label>
                    <input type="text" id="grupoEditNome" value="${esc(ref.nome)}">
                </div>
                <div class="form-group">
                    <label for="grupoEditArea">Categoria</label>
                    <select id="grupoEditArea">${opcoesDeCategoria(ref.area)}</select>
                </div>
                <div class="form-group" id="grupoNovaCategoriaBloco" style="display:none;">
                    <label for="grupoNovaCategoriaNome">Nome da nova categoria</label>
                    <input type="text" id="grupoNovaCategoriaNome" placeholder="Ex: Solventes">
                    <label for="grupoNovaCategoriaCor" style="margin-top:6px;">Cor da categoria</label>
                    <input type="color" id="grupoNovaCategoriaCor" value="#3498db" style="height:38px; padding:2px;">
                </div>
                <div class="form-group">
                    <label for="grupoEditPerigo">Perigo (separe por vírgula)</label>
                    <input type="text" id="grupoEditPerigo" list="listaPerigos" value="${esc(ref.perigo)}">
                </div>
                <div class="form-group">
                    <label for="grupoEditEstoqueMin">Estoque mínimo (${esc(ref.unidade)}) — gera alerta</label>
                    <input type="number" id="grupoEditEstoqueMin" min="0" step="any" value="${ref.estoque_min === '' ? '' : esc(ref.estoque_min)}">
                </div>
                <div class="form-group">
                    <label for="grupoEditComp">Observações</label>
                    <input type="text" id="grupoEditComp" value="${esc(ref.componentes)}">
                </div>
                <div class="form-group">
                    <label for="grupoEditImagem">Link da imagem (Google Drive)</label>
                    <input type="text" id="grupoEditImagem" value="${esc(ref.imagem_url)}">
                </div>
                <div class="form-group">
                    <label for="grupoEditManual">Link da FDS (ficha de segurança) — visível para todos</label>
                    <input type="text" id="grupoEditManual" value="${esc(ref.manual_url)}">
                </div>
                <div class="form-group">
                    <label for="grupoEditRoteiro">Link do roteiro</label>
                    <input type="text" id="grupoEditRoteiro" value="${esc(ref.roteiro_url)}">
                </div>
                <p style="font-size:12px; color:#7f8c8d;">Local, volume, validade e lote são de cada frasco: use "Editar frasco".</p>
                <button class="btn-admin-action" onclick="salvarEdicaoGrupo('${chave}')">Salvar alterações</button>
            </div>
        `;
        configurarSelectCategoria('grupoEditArea', 'grupoNovaCategoriaBloco');
    } else {
        const blocoImagem = ref.imagem_url
            ? `<img src="${escAttr(ref.imagem_url)}" alt="${escAttr(ref.nome)}" style="width:100%; border-radius:8px; margin-bottom:14px;" onerror="this.style.display='none'">`
            : '';
        modalConteudo.innerHTML = `
            ${cabecalho}
            ${blocoImagem}
            <p class="info-item"><span class="info-label">Categoria:</span> ${esc(ref.area) || 'Não definida'}</p>
            ${ref.componentes ? `<p class="info-item"><span class="info-label">Observações:</span> ${esc(ref.componentes)}</p>` : ''}
            <div class="modal-secao">
                <h4>Frascos (${unidades.length})</h4>
                ${unidades.map((u, i) => linhaFrasco(u, i + 1)).join('')}
            </div>

            <div class="modal-secao">
                <div class="form-group">
                    <label for="modalRelatoTexto">Reportar problema (vazamento, rótulo apagado, frasco danificado...)</label>
                    <textarea id="modalRelatoTexto" rows="3" placeholder="Descreva o que você percebeu (informe qual frasco)..."></textarea>
                    <button class="btn-admin-action" style="margin-top:8px;" onclick="reportarProblema(${ref.linha})">Enviar relato</button>
                </div>
            </div>
        `;
    }

    modalOverlay.style.display = 'flex';
}

// --- REGISTRAR USO (desconta do volume do frasco e grava no histórico) ---
function abrirModalUso(linha, chave) {
    const u = experimentos.find(e => e.linha === linha);
    if (!u) return;
    const modalConteudo = document.getElementById('modalConteudo');
    modalConteudo.innerHTML = `
        <button class="modal-fechar" onclick="fecharModal()">✕</button>
        <h3>Registrar uso</h3>
        <p class="info-item"><strong>${esc(u.nome)}</strong><br>
        Frasco ${u.localizacao ? 'em ' + esc(u.localizacao) : '(local não informado)'} — restam <strong>${fmtQtd(u.volume_atual, u.unidade)}</strong></p>
        <div class="form-group">
            <label for="usoQtd">Quanto foi usado (${esc(u.unidade)})</label>
            <input type="number" id="usoQtd" min="0" step="any" inputmode="decimal" placeholder="Ex: 50">
        </div>
        <button class="btn-admin-action" onclick="confirmarUso(${linha}, '${chave}')">Confirmar uso</button>
        <button class="btn-icon" style="width:100%; margin-top:8px; padding:8px;" onclick="abrirModalGrupo('${chave}')">← Voltar</button>
    `;
    document.getElementById('modalOverlay').style.display = 'flex';
    setTimeout(() => { const c = document.getElementById('usoQtd'); if (c) c.focus(); }, 50);
}

async function confirmarUso(linha, chave) {
    const u = experimentos.find(e => e.linha === linha);
    if (!u) return;
    const qtd = parseFloat(document.getElementById('usoQtd').value);
    if (!(qtd > 0)) { alert("Informe uma quantidade maior que zero."); return; }
    if (qtd > Number(u.volume_atual) + 1e-9) {
        alert(`Esse frasco só tem ${fmtQtd(u.volume_atual, u.unidade)}.`);
        return;
    }
    try {
        await enviarParaPlanilha('Experimentos', 'registrarUso', { linha, quantidade: qtd, usuario: nomeUsuario });
        await recarregarExperimentos();
        abrirModalGrupo(chave); // volta para o grupo já com o novo saldo
    } catch (err) {
        alert("Erro ao registrar uso: " + err.message);
    }
}

async function salvarEdicaoGrupo(chave) {
    const unidades = experimentos.filter(e => chaveDoGrupo(e) === chave);
    if (unidades.length === 0) return;
    const reag = ehReagente(unidades[0]);

    const nome = document.getElementById('grupoEditNome').value.trim();
    if (!nome) { alert("O nome não pode ficar em branco."); return; }

    const dados = {
        linhas: unidades.map(u => u.linha),
        nome,
        componentes: document.getElementById('grupoEditComp').value,
        imagem_url: document.getElementById('grupoEditImagem').value.trim(),
        manual_url: document.getElementById('grupoEditManual').value.trim(),
        roteiro_url: document.getElementById('grupoEditRoteiro').value.trim(),
        usuario: nomeUsuario
    };
    if (reag) {
        dados.perigo = document.getElementById('grupoEditPerigo').value.trim();
        dados.estoque_min = parseFloat(document.getElementById('grupoEditEstoqueMin').value) || '';
    } else {
        dados.localizacao = document.getElementById('grupoEditLocal').value;
        dados.capacidade = document.getElementById('grupoEditCapacidade').value.trim();
    }

    try {
        dados.area = await resolverCategoriaEscolhida('grupoEditArea', 'grupoNovaCategoriaNome', 'grupoNovaCategoriaCor');
        await enviarParaPlanilha('Experimentos', 'editarGrupo', dados);
        await recarregarExperimentos();
        fecharModal();
    } catch (err) {
        alert("Erro ao salvar alterações: " + err.message);
    }
}

async function removerGrupo(chave) {
    const unidades = experimentos.filter(e => chaveDoGrupo(e) === chave);
    if (unidades.length === 0) return;

    const termo = ehReagente(unidades[0]) ? 'frasco(s)' : 'unidade(s)';
    if (!confirm(`Remover TODOS os ${unidades.length} ${termo} de "${unidades[0].nome}" do inventário?`)) return;

    try {
        await enviarParaPlanilha('Experimentos', 'removerGrupo', { linhas: unidades.map(u => u.linha), usuario: nomeUsuario });
        await recarregarExperimentos();
    } catch (err) {
        alert("Erro ao remover: " + err.message);
    }
}

async function removerVazios(chave) {
    const vazios = experimentos.filter(e => chaveDoGrupo(e) === chave && ehReagente(e) && frascoVazio(e));
    if (vazios.length === 0) return;
    if (!confirm(`Remover ${vazios.length} frasco(s) vazio(s) de "${vazios[0].nome}" do inventário? Os frascos com líquido continuam.`)) return;
    try {
        await enviarParaPlanilha('Experimentos', 'removerGrupo', { linhas: vazios.map(u => u.linha), usuario: nomeUsuario });
        await recarregarExperimentos();
    } catch (err) {
        alert("Erro ao remover: " + err.message);
    }
}

// --- MODAL DE DETALHES DO ITEM (equipamento ou um frasco de reagente) ---
function abrirModalExperimento(linha) {
    const exp = experimentos.find(e => e.linha === linha);
    if (!exp) return;
    const reag = ehReagente(exp);

    const modalOverlay = document.getElementById('modalOverlay');
    const modalConteudo = document.getElementById('modalConteudo');

    const statusAtual = exp.status || 'Ativo';

    if (usuarioLogado) {
        const opcoesArea = opcoesDeCategoria(exp.area);
        const opcaoStatus = (valor, texto) => `<option value="${valor}" ${statusAtual === valor ? 'selected' : ''}>${texto}</option>`;
        const campoStatus = reag
            ? opcaoStatus('Ativo', 'Ativo (em uso)') + opcaoStatus('Descartado', 'Descartado (sem remover do inventário)')
            : opcaoStatus('Ativo', 'Ativo') + opcaoStatus('Em Reparo', 'Em Reparo') + opcaoStatus('Com Defeito', 'Com Defeito') + opcaoStatus('Desativado', 'Desativado (sem remover do inventário)');
        const opcaoUnidade = (un) => `<option value="${un}" ${exp.unidade === un ? 'selected' : ''}>${un}</option>`;

        const camposEspecificos = reag ? `
            <div class="linha-dupla">
                <div class="form-group">
                    <label for="modalEditVolFrasco">Volume do frasco</label>
                    <input type="number" id="modalEditVolFrasco" min="0" step="any" value="${esc(exp.volume_frasco)}">
                </div>
                <div class="form-group">
                    <label for="modalEditVolAtual">Volume atual</label>
                    <input type="number" id="modalEditVolAtual" min="0" step="any" value="${esc(exp.volume_atual)}">
                </div>
            </div>
            <p style="font-size:12px; color:#7f8c8d; margin-top:-6px;">Para descontar um uso, prefira o botão "Registrar uso" (ele anota quanto foi usado). Alterar o volume aqui grava um "Ajuste" no histórico.</p>
            <div class="form-group">
                <label for="modalEditUnidade">Unidade</label>
                <select id="modalEditUnidade">${['mL', 'L', 'g', 'kg'].map(opcaoUnidade).join('')}</select>
            </div>
            <div class="form-group">
                <label for="modalEditValidade">Validade (deixe em branco se não tiver)</label>
                <input type="date" id="modalEditValidade" value="${esc(exp.validade)}">
            </div>
            <div class="form-group">
                <label for="modalEditLote">Lote</label>
                <input type="text" id="modalEditLote" value="${esc(exp.lote)}">
            </div>
            <div class="form-group">
                <label for="modalEditPerigo">Perigo (separe por vírgula)</label>
                <input type="text" id="modalEditPerigo" list="listaPerigos" value="${esc(exp.perigo)}">
            </div>
            <div class="form-group">
                <label for="modalEditEstoqueMin">Estoque mínimo (${esc(exp.unidade)})</label>
                <input type="number" id="modalEditEstoqueMin" min="0" step="any" value="${exp.estoque_min === '' ? '' : esc(exp.estoque_min)}">
            </div>
        ` : `
            <div class="form-group">
                <label for="modalEditCapacidade">Capacidade (ex.: 100 mL)</label>
                <input type="text" id="modalEditCapacidade" value="${esc(exp.capacidade)}">
            </div>
            <div class="form-group">
                <label for="modalEditPatrimonio">Nº de patrimônio (desta unidade)</label>
                <input type="text" id="modalEditPatrimonio" value="${esc(exp.patrimonio)}">
            </div>
        `;

        modalConteudo.innerHTML = `
            <button class="modal-fechar" onclick="fecharModal()">✕</button>
            <h3>${reag ? 'Editar frasco' : 'Editar item'}</h3>

            <div class="form-group">
                <label for="modalEditNome">Nome</label>
                <input type="text" id="modalEditNome" value="${esc(exp.nome)}">
            </div>
            <div class="form-group">
                <label for="modalEditArea">Categoria</label>
                <select id="modalEditArea">${opcoesArea}</select>
            </div>
            <div class="form-group" id="modalNovaCategoriaBloco" style="display:none;">
                <label for="modalNovaCategoriaNome">Nome da nova categoria</label>
                <input type="text" id="modalNovaCategoriaNome" placeholder="Ex: Solventes">
                <label for="modalNovaCategoriaCor" style="margin-top:6px;">Cor da categoria</label>
                <input type="color" id="modalNovaCategoriaCor" value="#3498db" style="height:38px; padding:2px;">
            </div>
            <div class="form-group">
                <label for="modalEditLocal">Localização</label>
                <input type="text" id="modalEditLocal" value="${esc(exp.localizacao)}">
            </div>
            <div class="form-group">
                <label for="modalEditComp">Observações</label>
                <input type="text" id="modalEditComp" value="${esc(exp.componentes)}">
            </div>
            ${camposEspecificos}
            <div class="form-group">
                <label for="modalEditImagem">Link da imagem (Google Drive)</label>
                <input type="text" id="modalEditImagem" placeholder="https://drive.google.com/thumbnail?id=...&sz=w1000" value="${esc(exp.imagem_url)}">
            </div>
            <div class="form-group">
                <label for="modalEditManual">${reag ? 'Link da FDS (ficha de segurança) — visível para todos' : 'Link do manual (PDF no Drive) — visível só para professores'}</label>
                <input type="text" id="modalEditManual" placeholder="https://drive.google.com/file/d/.../view" value="${esc(exp.manual_url)}">
            </div>
            <div class="form-group">
                <label for="modalEditRoteiro">Link do roteiro (PDF no Drive) — aparece na lista de Roteiros</label>
                <input type="text" id="modalEditRoteiro" placeholder="https://drive.google.com/file/d/.../view" value="${esc(exp.roteiro_url)}">
            </div>
            <div class="form-group">
                <label for="modalEditStatus">Status</label>
                <select id="modalEditStatus">${campoStatus}</select>
            </div>
            <button class="btn-admin-action" onclick="salvarEdicaoExperimento(${linha})">Salvar alterações</button>

            <div class="modal-secao">
                <h4>Relatos deste item</h4>
                <div id="modalRelatosDoItem"></div>
            </div>
        `;

        configurarSelectCategoria('modalEditArea', 'modalNovaCategoriaBloco');

        const relatosDoItem = relatos.filter(r => String(r.experimento_linha) === String(linha));
        const container = document.getElementById('modalRelatosDoItem');
        if (relatosDoItem.length === 0) {
            container.innerHTML = `<p style="font-size:13px; color:#7f8c8d;">Nenhum relato pendente.</p>`;
        } else {
            container.innerHTML = relatosDoItem.map(r => `
                <div class="modal-relato-item">
                    <div>${esc(r.descricao)}</div>
                    <div style="color:#7f8c8d; font-size:11px;">${esc(r.data)}</div>
                    <div class="modal-relato-acoes">
                        <button class="btn-admin-action" onclick="confirmarRelato(${r.linha}, ${linha})">${reag ? 'Confirmar (descartar frasco)' : 'Confirmar defeito'}</button>
                        <button class="btn-icon" onclick="descartarRelato(${r.linha})">Descartar</button>
                    </div>
                </div>
            `).join('');
        }
    } else {
        const blocoImagem = exp.imagem_url
            ? `<img src="${escAttr(exp.imagem_url)}" alt="${escAttr(exp.nome)}" style="width:100%; border-radius:8px; margin-bottom:14px;" onerror="this.style.display='none'">`
            : '';
        const detalhesReagente = reag ? `
            <p class="info-item"><span class="info-label">Volume:</span> ${fmtNum(exp.volume_atual)} / ${fmtNum(exp.volume_frasco)} ${esc(exp.unidade)}</p>
            ${exp.validade ? `<p class="info-item"><span class="info-label">Validade:</span> ${dataBR(exp.validade)}</p>` : ''}
            ${exp.perigo ? `<p class="info-item"><span class="info-label">Perigo:</span> ${esc(exp.perigo)}</p>` : ''}
            ${exp.manual_url ? `<p class="info-item"><a href="${escAttr(exp.manual_url)}" target="_blank" rel="noopener">Abrir FDS ↗</a></p>` : ''}
        ` : '';

        modalConteudo.innerHTML = `
            <button class="modal-fechar" onclick="fecharModal()">✕</button>
            <h3>${esc(exp.nome)}</h3>
            ${blocoImagem}
            <p class="info-item"><span class="info-label">Categoria:</span> ${esc(exp.area) || 'Não definida'}</p>
            <p class="info-item"><span class="info-label">Localização:</span> ${esc(exp.localizacao) || 'Não cadastrada'}</p>
            <p class="info-item"><span class="info-label">Observações:</span> ${esc(exp.componentes) || '—'}</p>
            ${detalhesReagente}
            <p class="info-item"><span class="info-label">Status atual:</span> ${esc(statusAtual)}</p>

            <div class="modal-secao">
                <div class="form-group">
                    <label for="modalRelatoTexto">Reportar problema com este item</label>
                    <textarea id="modalRelatoTexto" rows="3" placeholder="Descreva o que você percebeu..."></textarea>
                    <button class="btn-admin-action" style="margin-top:8px;" onclick="reportarProblema(${linha})">Enviar relato</button>
                </div>
            </div>
        `;
    }

    modalOverlay.style.display = 'flex';
}

function fecharModal() {
    document.getElementById('modalOverlay').style.display = 'none';
}

function fecharModalSeClicouFora(event) {
    if (event.target.id === 'modalOverlay') fecharModal();
}

async function salvarEdicaoExperimento(linha) {
    const exp = experimentos.find(e => e.linha === linha);
    if (!exp) return;
    const reag = ehReagente(exp);

    const nome = document.getElementById('modalEditNome').value.trim();
    if (!nome) { alert("O nome não pode ficar em branco."); return; }

    const dados = {
        linha, tipo: exp.tipo, nome,
        localizacao: document.getElementById('modalEditLocal').value,
        componentes: document.getElementById('modalEditComp').value,
        imagem_url: document.getElementById('modalEditImagem').value.trim(),
        manual_url: document.getElementById('modalEditManual').value.trim(),
        roteiro_url: document.getElementById('modalEditRoteiro').value.trim(),
        status: document.getElementById('modalEditStatus').value,
        usuario: nomeUsuario
    };

    if (reag) {
        const volumeFrasco = parseFloat(document.getElementById('modalEditVolFrasco').value);
        const volumeAtual = parseFloat(document.getElementById('modalEditVolAtual').value);
        if (!(volumeFrasco > 0)) { alert("Informe o volume do frasco (maior que zero)."); return; }
        if (isNaN(volumeAtual) || volumeAtual < 0) { alert("Informe o volume atual (zero ou mais)."); return; }
        if (volumeAtual > volumeFrasco && !confirm("O volume atual é maior que o volume do frasco. Salvar mesmo assim?")) return;
        Object.assign(dados, {
            volume_frasco: volumeFrasco,
            volume_atual: volumeAtual,
            unidade: document.getElementById('modalEditUnidade').value,
            validade: document.getElementById('modalEditValidade').value,
            lote: document.getElementById('modalEditLote').value.trim(),
            perigo: document.getElementById('modalEditPerigo').value.trim(),
            estoque_min: parseFloat(document.getElementById('modalEditEstoqueMin').value) || ''
        });
    } else {
        dados.capacidade = document.getElementById('modalEditCapacidade').value.trim();
        dados.patrimonio = document.getElementById('modalEditPatrimonio').value.trim();
    }

    try {
        dados.area = await resolverCategoriaEscolhida('modalEditArea', 'modalNovaCategoriaNome', 'modalNovaCategoriaCor');
        await enviarParaPlanilha('Experimentos', 'editar', dados);
        await recarregarExperimentos();
        fecharModal();
    } catch (err) {
        alert("Erro ao salvar alterações: " + err.message);
    }
}

async function reportarProblema(linha) {
    const descricao = document.getElementById('modalRelatoTexto').value.trim();
    if (!descricao) { alert("Descreva o problema antes de enviar."); return; }

    const hoje = new Date();
    const dataFormatada = `${String(hoje.getDate()).padStart(2, '0')}/${String(hoje.getMonth() + 1).padStart(2, '0')}/${hoje.getFullYear()}`;

    try {
        await enviarParaPlanilha('Relatos', 'adicionar', { experimento_linha: linha, descricao, data: dataFormatada });
        alert("Obrigado! O relato foi enviado e será verificado pelo responsável do laboratório.");
        fecharModal();
    } catch (err) {
        alert("Erro ao enviar relato: " + err.message);
    }
}

// --- PAINEL ADMIN: RELATOS PENDENTES ---
function exibirRoteirosCadastrados() {
    const lista = document.getElementById('roteirosCadastradosList');
    const contador = document.getElementById('contadorRoteiros');
    if (!lista || !contador) return;

    const comRoteiro = experimentos.filter(e => e.roteiro_url);
    contador.textContent = comRoteiro.length;

    if (comRoteiro.length === 0) {
        lista.innerHTML = `<p style="font-size:13px; color:#7f8c8d;">Nenhum roteiro cadastrado ainda.</p>`;
        return;
    }

    lista.innerHTML = comRoteiro.map(e => `
        <div class="modal-relato-item" style="display:flex; justify-content:space-between; align-items:center;">
            <strong>${e.nome}</strong>
            <a href="${e.roteiro_url}" target="_blank" rel="noopener" class="btn-admin-action" style="padding:4px 10px; font-size:12px; text-decoration:none;">Abrir</a>
        </div>
    `).join('');
}

function exibirRelatosPendentes() {
    const lista = document.getElementById('relatosPendentesList');
    const contador = document.getElementById('contadorRelatos');
    if (!lista || !contador) return;

    contador.textContent = relatos.length;

    if (relatos.length === 0) {
        lista.innerHTML = `<p style="font-size:13px; color:#7f8c8d;">Nenhum relato pendente.</p>`;
        return;
    }

    lista.innerHTML = relatos.map(r => {
        const exp = experimentos.find(e => String(e.linha) === String(r.experimento_linha));
        const nomeExp = exp ? exp.nome : `Experimento (linha ${r.experimento_linha})`;
        return `
            <div class="modal-relato-item">
                <strong>${nomeExp}</strong>
                <div>${r.descricao}</div>
                <div style="color:#7f8c8d; font-size:11px;">${r.data}</div>
                <div class="modal-relato-acoes">
                    <button class="btn-admin-action" onclick="confirmarRelato(${r.linha}, ${r.experimento_linha})">${exp && ehReagente(exp) ? 'Confirmar (descartar frasco)' : 'Confirmar defeito'}</button>
                    <button class="btn-icon" onclick="descartarRelato(${r.linha})">Descartar</button>
                </div>
            </div>
        `;
    }).join('');
}

async function confirmarRelato(linhaRelato, experimentoLinha) {
    try {
        const alvo = experimentos.find(e => e.linha === experimentoLinha);
        const novoStatus = ehReagente(alvo) ? 'Descartado' : 'Com Defeito';
        await enviarParaPlanilha('Experimentos', 'mudarStatus', { linha: experimentoLinha, status: novoStatus });
        await enviarParaPlanilha('Relatos', 'remover', { linha: linhaRelato });
        await Promise.all([recarregarExperimentos(), recarregarRelatos()]);
        fecharModal();
    } catch (err) {
        alert("Erro ao confirmar relato: " + err.message);
    }
}

async function descartarRelato(linhaRelato) {
    if (!confirm("Descartar esse relato sem alterar o status do experimento?")) return;
    try {
        await enviarParaPlanilha('Relatos', 'remover', { linha: linhaRelato });
        await recarregarRelatos();
    } catch (err) {
        alert("Erro ao descartar relato: " + err.message);
    }
}

// --- PAINEL ADMIN: HISTÓRICO DE USO DE REAGENTES ---
function exibirHistorico() {
    const lista = document.getElementById('historicoList');
    if (!lista) return;
    if (!historico || historico.length === 0) {
        lista.innerHTML = `<p style="font-size:13px; color:#7f8c8d;">Nenhum registro ainda.</p>`;
        return;
    }
    lista.innerHTML = historico.slice(0, 50).map(h => {
        const exp = experimentos.find(e => e.linha === h.linha && e.nome === h.item);
        const un = exp ? ' ' + exp.unidade : '';
        let texto;
        if (h.acao === 'Uso') texto = `💧 Uso de ${fmtNum(h.quantidade)}${un} (restam ${fmtNum(h.volume_apos)}${un})`;
        else if (h.acao === 'Entrada') texto = `📥 Entrada de frasco com ${fmtNum(h.volume_apos)}${un}`;
        else if (h.acao === 'Ajuste') texto = `✏️ Ajuste de ${h.quantidade > 0 ? '+' : ''}${fmtNum(h.quantidade)}${un} (agora ${fmtNum(h.volume_apos)}${un})`;
        else if (h.acao === 'Remoção') texto = `🗑️ Frasco removido (tinha ${fmtNum(h.quantidade)}${un})`;
        else texto = esc(h.acao);
        return `
            <div class="modal-relato-item">
                <strong>${esc(h.item)}</strong>
                <div>${texto}</div>
                <div style="color:#7f8c8d; font-size:11px;">${esc(h.data)} · ${esc(h.usuario || '—')}</div>
            </div>
        `;
    }).join('');
}

async function recarregarHistorico() {
    if (!usuarioLogado) return;
    try {
        historico = await buscarDaPlanilha('Historico', true);
        exibirHistorico();
    } catch (err) {
        console.error('Erro ao carregar histórico:', err);
    }
}

// --- BARRA DE BUSCA ---
if (searchBar) {
    searchBar.addEventListener('input', aplicarFiltros);
}

// --- FORMULÁRIO DE CADASTRO: campos conforme o tipo ---
(function () {
    const selTipo = document.getElementById('expTipo');
    const form = document.getElementById('formNovoExperimento');
    if (selTipo) selTipo.addEventListener('change', sincronizarFormTipo);
    if (form) form.addEventListener('reset', () => setTimeout(sincronizarFormTipo, 0));
    sincronizarFormTipo();
})();

// --- ASSOCIAÇÃO DAS FUNÇÕES AO ESCOPO GLOBAL (WINDOW) ---
window.entrarComoAluno = entrarComoAluno;
window.mostrarTelaAuth = mostrarTelaAuth;
window.voltarParaInicio = voltarParaInicio;
window.alternarTab = alternarTab;
window.executarCadastro = executarCadastro;
window.executarLogin = executarLogin;
window.adicionarExperimentoNoGrid = adicionarExperimentoNoGrid;
window.removerExperimento = removerExperimento;
window.adicionarAvisoNoMural = adicionarAvisoNoMural;
window.removerAviso = removerAviso;
window.abrirModalExperimento = abrirModalExperimento;
window.fecharModal = fecharModal;
window.fecharModalSeClicouFora = fecharModalSeClicouFora;
window.salvarEdicaoExperimento = salvarEdicaoExperimento;
window.reportarProblema = reportarProblema;
window.confirmarRelato = confirmarRelato;
window.descartarRelato = descartarRelato;
window.ativarModoInventario = ativarModoInventario;
window.encerrarModoInventario = encerrarModoInventario;
window.cancelarModoInventario = cancelarModoInventario;
window.atualizarAgora = function () { carregarDados(true); };
window.abrirModalGrupo = abrirModalGrupo;
window.salvarEdicaoGrupo = salvarEdicaoGrupo;
window.removerGrupo = removerGrupo;
window.abrirModalUso = abrirModalUso;
window.confirmarUso = confirmarUso;
window.definirFiltro = definirFiltro;
window.sincronizarFormTipo = sincronizarFormTipo;