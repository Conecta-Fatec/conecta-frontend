/* =========================================================
   Sistema de Notificações
   Busca, exibe e gerencia o status (lida/não lida)
========================================================= */
document.addEventListener('DOMContentLoaded', async () => {
  // Verifica se o usuário está logado usando a função global do seu projeto
  if (typeof requireAuth === 'function' && !requireAuth()) return;

  const container = document.getElementById('notifications-container');
  const badge = document.getElementById('notification-badge');

  // Mapeamento visual para os tipos de notificação que criamos no backend
  const notificationTypes = {
    'like': { icon: '❤️', text: 'curtiu sua publicação.', color: 'text-danger' },
    'comment': { icon: '💬', text: 'comentou na sua publicação.', color: 'text-primary' },
    'friend_request': { icon: '👋', text: 'enviou uma solicitação de amizade.', color: 'text-success' },
    'friend_accept': { icon: '🤝', text: 'aceitou seu pedido de amizade.', color: 'text-info' }
  };

  // 1. Busca as notificações na API
  async function loadNotifications() {
    try {
      if (container) container.innerHTML = '<p class="text-center text-muted mt-4">Buscando atualizações...</p>';
      
      const data = await apiJSON('/api/notifications/'); 
      
      // A nossa API vai retornar { unread_count: X, results: [...] }
      const notifications = data.results || []; 
      const unreadCount = data.unread_count || 0;

      updateBadge(unreadCount);
      renderNotifications(notifications);
    } catch (error) {
      console.error("Erro ao carregar notificações:", error);
      if (container) {
        container.innerHTML = '<p class="text-danger text-center mt-4">Erro ao conectar com o servidor.</p>';
      }
    }
  }

  // 2. Atualiza o sininho no menu lateral
  function updateBadge(count) {
    if (!badge) return;
    
    badge.textContent = count;
    if (count > 0) {
      badge.classList.remove('d-none');
    } else {
      badge.classList.add('d-none');
    }
  }

  // 3. Desenha a lista na tela
  function renderNotifications(notifications) {
    if (!container) return;

    if (!notifications || notifications.length === 0) {
      container.innerHTML = `
        <article class="settings-card empty-notification-card">
          <h2 class="h5 text-center mt-3">Você está em dia!</h2>
          <p class="text-center text-muted">Nenhuma notificação nova por enquanto.</p>
        </article>
      `;
      return;
    }

    const html = notifications.map(notif => {
      // Tenta pegar o nome do usuário que gerou a notificação
      const senderName = notif.sender?.first_name 
        ? `${notif.sender.first_name} ${notif.sender.last_name}` 
        : notif.sender?.nickname || 'Alguém';
        
      const typeInfo = notificationTypes[notif.notification_type] || { icon: '🔔', text: 'interagiu com você.', color: '' };
      
      // Se não foi lida, deixa o texto em negrito e mostra a bolinha azul
      const isReadClass = notif.is_read ? 'opacity-75' : 'fw-bold';
      const unreadDot = !notif.is_read ? '<div class="ms-3 bg-primary rounded-circle" style="width: 10px; height: 10px; flex-shrink: 0;"></div>' : '';
      
      return `
        <div class="d-flex align-items-center p-3 border-bottom ${isReadClass}" style="cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='var(--hover-bg)'" onmouseout="this.style.background='transparent'" onclick="markAsRead(${notif.id})">
          <div class="me-3 fs-4 ${typeInfo.color}">${typeInfo.icon}</div>
          <div class="flex-grow-1">
            <span class="d-block"><strong style="color: var(--text-color);">${escapeHTML(senderName)}</strong> ${typeInfo.text}</span>
            <span class="text-muted" style="font-size: 0.8rem;">${new Date(notif.created_at).toLocaleString('pt-BR')}</span>
          </div>
          ${unreadDot}
        </div>
      `;
    }).join('');

    container.innerHTML = html;
  }

  // 4. Função global para marcar como lida ao clicar
  window.markAsRead = async function(notifId) {
    try {
      // Faz o PATCH na API para mudar is_read para true
      await apiFetch(`/api/notifications/${notifId}/read/`, {
        method: 'PATCH'
      });
      
      // Recarrega a lista para atualizar a cor e o número do sininho
      loadNotifications();
    } catch (error) {
      console.error("Erro ao marcar como lido", error);
    }
  };

  // Inicia o carregamento quando entra na página
  loadNotifications();
});