/* ============================================================
   STALLION — LÓGICA DO SISTEMA (app.js)
   Organizado por seções:
   1. Conexão com o Supabase (banco de dados)
   2. Configurações do sistema
   3. Funções utilitárias
   4. Navegação entre abas
   5. Busca de pedido (tela do cliente)
   6. Login e logout (painel interno)
   7. Criar novo pedido
   8. Atualizar status do pedido
   9. Carregar lista de pedidos
============================================================ */


/* ============================================================
   1. CONEXÃO COM O SUPABASE
   Aqui conectamos ao banco de dados onde os pedidos ficam salvos.
   SUPABASE_URL  = endereço do projeto no Supabase
   SUPABASE_KEY  = chave pública de acesso (segura para usar no front-end)
============================================================ */
const SUPABASE_URL = 'https://eyfiinamaysiuzrelhfk.supabase.co';
const SUPABASE_KEY = 'sb_publishable_C6wTA6N1oSNICMapXKWQbw_iZK0Gn1y';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);


/* ============================================================
   2. CONFIGURAÇÕES DO SISTEMA
============================================================ */

// Etapas do pedido em ordem — usadas na timeline e nos selects
const STEPS = [
  { label: 'Pagamento confirmado', icon: 'credit' },
  { label: 'Separação no estoque', icon: 'box'    },
  { label: 'Saiu para entrega',    icon: 'truck'  },
  { label: 'Entregue',             icon: 'check'  }
];

// Senhas de cada setor — em produção, troque por senhas fortes!
const SENHAS = {
  financeiro: 'fin123',
  estoque:    'est123',
  expedicao:  'exp123',
  entrega:    'ent123'
};

// Nomes legíveis dos setores para exibir na tela
const SETOR_NAMES = {
  financeiro: 'Financeiro',
  estoque:    'Estoque',
  expedicao:  'Expedição',
  entrega:    'Entrega'
};

// Guarda o setor logado durante a sessão
let currentSetor = null;


/* ============================================================
   3. FUNÇÕES UTILITÁRIAS
============================================================ */

// Retorna a data e hora atual no formato "DD/MM HH:MM"
// Usada para registrar quando cada etapa foi concluída
function agora() {
  const d = new Date();
  const dia  = d.getDate().toString().padStart(2, '0');
  const mes  = (d.getMonth() + 1).toString().padStart(2, '0');
  const hora = d.getHours().toString().padStart(2, '0');
  const min  = d.getMinutes().toString().padStart(2, '0');
  return `${dia}/${mes} ${hora}:${min}`;
}

// Gera um ID único no formato STL-00000001
// Conta os pedidos existentes e incrementa em 1
async function gerarId() {
  const { count } = await db.from('pedidos').select('*', { count: 'exact', head: true });
  return 'STL-' + String((count || 0) + 1).padStart(8, '0');
}

// Retorna o SVG do ícone baseado no nome
// Usados nos círculos da timeline
function svgIcon(name) {
  const icons = {
    credit: '<path d="M21 4H3a2 2 0 00-2 2v12a2 2 0 002 2h18a2 2 0 002-2V6a2 2 0 00-2-2z"/><line x1="1" y1="10" x2="23" y2="10"/>',
    box:    '<path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>',
    truck:  '<rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
    check:  '<polyline points="20 6 9 17 4 12"/>'
  };
  return `<svg viewBox="0 0 24 24" style="width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;">${icons[name]}</svg>`;
}


/* ============================================================
   4. NAVEGAÇÃO ENTRE ABAS
   Controla qual aba fica visível (Cliente ou Painel Interno)
============================================================ */
function showTab(tab) {
  // Remove a classe "active" de todas as abas e seções
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));

  // Ativa somente a aba e seção clicadas
  document.getElementById('tab-btn-' + tab).classList.add('active');
  document.getElementById('tab-' + tab).classList.add('active');
}


/* ============================================================
   5. BUSCA DE PEDIDO (tela do cliente)
   O cliente digita o ID e vê as etapas do pedido com horários
============================================================ */
async function buscarPedido() {
  const val  = document.getElementById('search-input').value.trim().toUpperCase();
  const err  = document.getElementById('search-err');
  const area = document.getElementById('result-area');
  const btn  = document.getElementById('btn-buscar');

  if (!val) return;

  // Mostra loading enquanto busca
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Buscando...';
  area.innerHTML = '';
  err.style.display = 'none';

  // Busca o pedido no banco pelo id_pedido
  const { data, error } = await db.from('pedidos').select('*').eq('id_pedido', val).single();

  // Restaura o botão após a busca
  btn.disabled = false;
  btn.innerHTML = `<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg> Buscar`;

  // Se não encontrou, mostra mensagem de erro
  if (error || !data) {
    err.style.display = 'block';
    return;
  }

  // Monta a timeline com as etapas
  const history = data.history || [];
  let timelineHTML = '';

  STEPS.forEach((step, i) => {
    const isDone    = i < data.step;   // etapa já concluída
    const isCurrent = i === data.step; // etapa atual
    const isPending = i > data.step;   // etapa futura
    const dotClass  = isDone ? 'done' : isCurrent ? 'current' : 'pending';
    const hist      = history.find(h => h.step === i); // horário desta etapa
    const showLine  = i < STEPS.length - 1;

    timelineHTML += `
      <div class="tl-item">
        <div class="tl-left">
          <div class="tl-dot ${dotClass}">${svgIcon(step.icon)}</div>
          ${showLine ? `<div class="tl-line ${isDone ? 'done' : ''}"></div>` : ''}
        </div>
        <div class="tl-content">
          <div class="tl-label ${isPending ? 'pending' : ''}">${step.label}</div>
          ${hist ? `<div class="tl-time">${hist.time}</div>` : ''}
        </div>
      </div>`;
  });

  // Renderiza o card de resultado na tela
  area.innerHTML = `
    <div class="card result-card">
      <div class="order-top">
        <div>
          <div class="order-id-label">Número do pedido</div>
          <div class="order-id-value">${data.id_pedido}</div>
          <div class="order-client">${data.cliente}</div>
        </div>
        <span class="badge badge-${Math.min(data.step, 3)}">${STEPS[data.step].label}</span>
      </div>
      <div class="timeline">${timelineHTML}</div>
    </div>`;
}


/* ============================================================
   6. LOGIN E LOGOUT (painel interno)
   Verifica setor + senha e libera o acesso ao painel
============================================================ */
function fazerLogin() {
  const setor = document.getElementById('setor-select').value;
  const senha = document.getElementById('senha-input').value;
  const err   = document.getElementById('login-err');

  // Verifica se a senha bate com a do setor selecionado
  if (!setor || SENHAS[setor] !== senha) {
    err.style.display = 'block';
    return;
  }

  err.style.display = 'none';
  currentSetor = setor;

  // Esconde o login e mostra o painel
  document.getElementById('login-area').style.display  = 'none';
  document.getElementById('painel-area').style.display = 'block';
  document.getElementById('setor-nome').textContent    = 'Setor: ' + SETOR_NAMES[setor];
  document.getElementById('header-info').textContent   = SETOR_NAMES[setor];

  // Carrega os pedidos do banco
  carregarPedidos();
}

function logout() {
  currentSetor = null;

  // Volta para a tela de login e limpa os campos
  document.getElementById('login-area').style.display  = 'block';
  document.getElementById('painel-area').style.display = 'none';
  document.getElementById('senha-input').value         = '';
  document.getElementById('setor-select').value        = '';
  document.getElementById('header-info').textContent   = 'Sistema de Pedidos';
}


/* ============================================================
   7. CRIAR NOVO PEDIDO
   Gera um ID automático e salva no banco com step 0
============================================================ */
async function criarPedido() {
  const nome = document.getElementById('novo-cliente').value.trim();
  if (!nome) return;

  const btn = document.getElementById('btn-criar');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  // Gera o próximo ID disponível (ex: STL-00000004)
  const id = await gerarId();

  // Insere o pedido no banco com a etapa inicial "Pagamento confirmado"
  const { error } = await db.from('pedidos').insert([{
    id_pedido: id,
    cliente:   nome,
    step:      0,
    history:   [{ step: 0, time: agora() }]
  }]);

  btn.disabled = false;
  btn.innerHTML = `<svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Novo Pedido`;

  if (!error) {
    document.getElementById('novo-cliente').value = '';
    carregarPedidos(); // atualiza a lista
  }
}


/* ============================================================
   8. ATUALIZAR STATUS DO PEDIDO
   Chamado quando o funcionário clica em "Atualizar"
   Salva a nova etapa e registra o horário no histórico
============================================================ */
async function atualizarStep(id) {
  const sel     = document.getElementById('sel-' + id);
  const newStep = parseInt(sel.value);
  const btn     = document.getElementById('btn-' + id);

  // Busca o pedido atual para pegar o histórico existente
  const { data: current } = await db.from('pedidos').select('*').eq('id_pedido', id).single();
  if (!current) return;

  // Adiciona o horário da nova etapa no histórico (se ainda não existir)
  const history = current.history || [];
  if (!history.find(h => h.step === newStep)) {
    history.push({ step: newStep, time: agora() });
  }

  btn.disabled     = true;
  btn.textContent  = 'Salvando...';

  // Salva a nova etapa e histórico no banco
  const { error } = await db.from('pedidos')
    .update({ step: newStep, history })
    .eq('id_pedido', id);

  if (!error) {
    // Feedback visual de sucesso
    btn.textContent      = '✓ Salvo!';
    btn.style.background = '#1b8a4e';
    btn.style.color      = '#fff';
    setTimeout(() => carregarPedidos(), 1000); // recarrega a lista após 1 segundo
  } else {
    btn.disabled    = false;
    btn.textContent = 'Atualizar';
  }
}


/* ============================================================
   9. CARREGAR LISTA DE PEDIDOS
   Busca todos os pedidos do banco e renderiza na tela
   Ordenados do mais recente para o mais antigo
============================================================ */
async function carregarPedidos() {
  const el = document.getElementById('orders-list');

  // Mostra loading enquanto carrega
  el.innerHTML = '<div class="loading"><span class="spinner"></span> Carregando pedidos...</div>';

  const { data: orders, error } = await db
    .from('pedidos')
    .select('*')
    .order('created_at', { ascending: false });

  if (error || !orders) {
    el.innerHTML = '<div class="empty-state">Erro ao carregar pedidos.</div>';
    return;
  }

  if (!orders.length) {
    el.innerHTML = '<div class="empty-state">Nenhum pedido cadastrado ainda.</div>';
    return;
  }

  // Renderiza cada pedido como um card com select de status
  el.innerHTML = orders.map(o => {
    const opts = STEPS.map((s, i) =>
      `<option value="${i}" ${o.step === i ? 'selected' : ''}>${s.label}</option>`
    ).join('');

    return `
      <div class="order-row">
        <div class="order-info">
          <strong>${o.id_pedido}</strong>
          <span>${o.cliente}</span>
        </div>
        <div class="order-actions">
          <select class="step-select" id="sel-${o.id_pedido}">${opts}</select>
          <button class="btn btn-red btn-sm" id="btn-${o.id_pedido}" onclick="atualizarStep('${o.id_pedido}')">
            Atualizar
          </button>
        </div>
      </div>`;
  }).join('');
}
