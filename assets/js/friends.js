document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;

  try {
    await loadLoggedUser();
  } catch (error) {
    console.error(error);
  }

  const friendsContainer = document.getElementById('my-friends-container');
  const receivedContainer = document.getElementById('received-requests-container');
  const sentContainer = document.getElementById('sent-requests-container');

  function friendCard(user, actionsHTML = '', subtitle = '') {
    const name = userDisplayName(user);
    return `
      <article class="friend-card">
        <a href="${profileUrlFor(user)}" class="avatar-link">${avatarHTML(user, 'friend-card-avatar user-avatar')}</a>
        <div class="friend-card-body">
          <a href="${profileUrlFor(user)}" class="friend-card-link"><strong class="friend-card-name">${escapeHTML(name)}</strong></a>
          <span>@${escapeHTML(user.nickname || 'usuario')}${subtitle ? ` ${escapeHTML(subtitle)}` : ''}</span>
          <p>${escapeHTML(user.bio || 'Sem bio')}</p>
          ${actionsHTML}
        </div>
      </article>
    `;
  }

  function normalizeList(data, key) {
    if (Array.isArray(data)) return data;
    return data?.[key] || data?.results || [];
  }

  window.loadFriends = async function loadFriends() {
    try {
      const data = await apiJSON('/api/users/friends/');
      renderFriends(normalizeList(data, 'friends'));
    } catch (e) {
      console.error(e);
      friendsContainer.innerHTML = '<p class="text-danger w-100 mt-2">Erro ao carregar amizades.</p>';
    }
  };

  function renderFriends(friends) {
    document.getElementById('friends-count').textContent = friends.length;

    if (friends.length === 0) {
      friendsContainer.innerHTML = '<p class="text-muted w-100 mt-2">Você ainda não tem amigos adicionados.</p>';
      return;
    }

    friendsContainer.innerHTML = friends.map((friend) => friendCard(
      friend,
      `<button type="button" class="friend-card-btn remove-friend-btn" onclick="removeFriend('${escapeHTML(friend.nickname)}')">Remover amizade</button>`
    )).join('');
  }

  window.loadReceivedRequests = async function loadReceivedRequests() {
    try {
      const data = await apiJSON('/api/users/friend-requests/received/');
      renderReceivedRequests(normalizeList(data, 'requests'));
    } catch (e) {
      console.error(e);
      receivedContainer.innerHTML = '<p class="text-danger w-100 mt-2">Erro ao carregar solicitações.</p>';
    }
  };

  function renderReceivedRequests(requests) {
    document.getElementById('received-count').textContent = requests.length;

    if (requests.length === 0) {
      receivedContainer.innerHTML = '<p class="text-muted w-100 mt-2">Nenhuma solicitação recebida.</p>';
      return;
    }

    receivedContainer.innerHTML = requests.map((req) => friendCard(
      req.sender,
      `<div class="d-flex gap-2 mt-2">
        <button type="button" class="friend-card-btn" onclick="acceptFriend('${escapeHTML(req.sender.nickname)}')">Aceitar</button>
        <button type="button" class="friend-card-btn cancel-request-btn" onclick="rejectFriend('${escapeHTML(req.sender.nickname)}')">Recusar</button>
      </div>`,
      'quer ser seu amigo'
    )).join('');
  }

  window.loadSentRequests = async function loadSentRequests() {
    try {
      const data = await apiJSON('/api/users/friend-requests/sent/');
      renderSentRequests(normalizeList(data, 'requests'));
    } catch (e) {
      console.error(e);
      sentContainer.innerHTML = '<p class="text-danger w-100 mt-2">Erro ao carregar solicitações enviadas.</p>';
    }
  };

  function renderSentRequests(requests) {
    document.getElementById('sent-count').textContent = requests.length;

    if (requests.length === 0) {
      sentContainer.innerHTML = '<p class="text-muted w-100 mt-2">Nenhuma solicitação enviada.</p>';
      return;
    }

    sentContainer.innerHTML = requests.map((req) => friendCard(
      req.receiver,
      `<button type="button" class="friend-card-btn cancel-request-btn" onclick="cancelRequest('${escapeHTML(req.receiver.nickname)}')">Cancelar pedido</button>`,
      'aguardando resposta'
    )).join('');
  }

  async function refreshAll() {
    await Promise.all([loadFriends(), loadReceivedRequests(), loadSentRequests()]);
  }

  window.sendFriendRequest = async function sendFriendRequest() {
    const nickname = document.getElementById('targetNickname').value.trim();
    const errEl = document.getElementById('friendError');
    const sucEl = document.getElementById('friendSuccess');
    errEl.style.display = 'none';
    sucEl.style.display = 'none';

    if (!nickname) {
      errEl.textContent = 'Digite um nickname válido.';
      errEl.style.display = 'block';
      return;
    }

    try {
      await apiJSON(`/api/users/friend-request/${encodeURIComponent(nickname)}/send/`, { method: 'POST' });
      sucEl.textContent = 'Solicitação enviada com sucesso!';
      sucEl.style.display = 'block';
      document.getElementById('targetNickname').value = '';
      await refreshAll();
    } catch (e) {
      errEl.textContent = e.message || 'Erro ao enviar solicitação.';
      errEl.style.display = 'block';
    }
  };

  window.acceptFriend = async function acceptFriend(nickname) {
    await apiFetch(`/api/users/friend-request/${encodeURIComponent(nickname)}/accept/`, { method: 'POST' });
    await refreshAll();
  };

  window.rejectFriend = async function rejectFriend(nickname) {
    await apiFetch(`/api/users/friend-request/${encodeURIComponent(nickname)}/reject/`, { method: 'POST' });
    await refreshAll();
  };

  window.cancelRequest = async function cancelRequest(nickname) {
    await apiFetch(`/api/users/friend-request/${encodeURIComponent(nickname)}/cancel/`, { method: 'POST' });
    await refreshAll();
  };

  window.removeFriend = async function removeFriend(nickname) {
    if (!confirm(`Tem certeza que deseja remover @${nickname} dos seus amigos?`)) return;
    await apiFetch(`/api/users/friend/${encodeURIComponent(nickname)}/remove/`, { method: 'POST' });
    await refreshAll();
  };

  await refreshAll();
});
