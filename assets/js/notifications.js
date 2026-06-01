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
      const senderName = notif.sender?.first_name 
        ? `${notif.sender.first_name} ${notif.sender.last_name}` 
        : notif.sender?.nickname || 'Alguém';
        
      const typeInfo = notificationTypes[notif.notification_type] || { icon: '🔔', text: 'interagiu com você.', color: '' };
      
      const isReadClass = notif.is_read ? 'opacity-75' : 'fw-bold';
      const unreadDot = !notif.is_read ? '<div class="ms-3 bg-primary rounded-circle" style="width: 10px; height: 10px; flex-shrink: 0;"></div>' : '';
      
      // Aqui passamos os dados extras (tipo, id do post e id do usuário) para a função de clique
      return `
        <div class="d-flex align-items-center p-3 border-bottom ${isReadClass}" 
             style="cursor: pointer; transition: background 0.2s;" 
             onmouseover="this.style.background='var(--hover-bg)'" 
             onmouseout="this.style.background='transparent'" 
             onclick="clickNotification(${notif.id}, '${notif.notification_type}', ${notif.post || null}, ${notif.sender?.id || null})">
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

  // 4. Nova função global que marca como lida E redireciona o usuário
  window.clickNotification = function(notifId, type, postId, senderId) {
    // 1. Manda a requisição para o backend marcar como lido em segundo plano
    // (Não usamos "await" aqui para não atrasar o redirecionamento da tela)
    apiFetch(`/api/notifications/${notifId}/read/`, { method: 'PATCH' })
      .catch(error => console.error("Erro ao marcar como lido", error));

    // 2. Decide para qual página o usuário vai dependendo da notificação
    if (type === 'like' || type === 'comment') {
        if (postId) {
            // Ajuste este link para a página que exibe o seu post inteiro
            window.location.href = `post.html?id=${postId}`; 
        }
    } else if (type === 'friend_request' || type === 'friend_accept') {
        if (senderId) {
            // Ajuste este link para a página de perfil público do usuário
            window.location.href = `profile.html?id=${senderId}`;
        }
    }
  };