/* =========================================================
   Amizades: layout espelhado em comunidades + solicitações
========================================================= */
document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;

  try {
    await loadLoggedUser();
  } catch (error) {
    console.error(error);
  }

  const friendsContainer = document.getElementById('my-friends-container');
  const exploreContainer = document.getElementById('explore-friends-container');
  const receivedContainer = document.getElementById('received-requests-container');
  const sentContainer = document.getElementById('sent-requests-container');
  const searchInput = document.getElementById('targetNickname');
  const friendError = document.getElementById('friendError');
  const friendSuccess = document.getElementById('friendSuccess');
  const requestsReceivedTab = document.getElementById('requests-received-tab');
  const requestsSentTab = document.getElementById('requests-sent-tab');

  const state = {
    friends: [],
    explore: [],
    received: [],
    sent: [],
    query: '',
    friendsVisible: 4,
    exploreVisible: 4,
    totalUsers: null,
    requestMode: 'received',
  };

  function normalizeList(data, key) {
    if (Array.isArray(data)) return data;
    return data?.[key] || data?.results || data?.items || [];
  }

  function isSameUser(a = {}, b = {}) {
    return Boolean((a.id && b.id && Number(a.id) === Number(b.id)) || (a.nickname && b.nickname && a.nickname === b.nickname));
  }

  function friendCard(user = {}, actionsHTML = '', tag = '') {
    const name = userDisplayName(user);
    return `
      <article class="friend-card community-card friend-community-card">
        <a href="${profileUrlFor(user)}" class="avatar-link">${avatarHTML(user, 'friend-card-avatar user-avatar community-card-avatar')}</a>
        <div class="friend-card-body community-card-body">
          ${tag ? `<span class="community-card-tag">${tag}</span>` : ''}
          <a href="${profileUrlFor(user)}" class="friend-card-link"><h3 class="friend-card-name">${escapeHTML(name)}</h3></a>
          <span class="nickname-text">@${escapeHTML(user.nickname || 'usuario')}</span>
          <p>${escapeHTML(user.bio || user.course || 'Sem bio')}</p>
          ${actionsHTML}
        </div>
      </article>
    `;
  }

  function matchesSearch(user = {}) {
    if (!state.query) return true;
    const haystack = `${user.full_name || ''} ${user.first_name || ''} ${user.last_name || ''} ${user.nickname || ''} ${user.course || ''}`.toLowerCase();
    return haystack.includes(state.query);
  }

  function setStatusCounts() {
    document.getElementById('friends-count').textContent = state.friends.length;
    document.getElementById('received-count').textContent = state.received.length;
    document.getElementById('sent-count').textContent = state.sent.length;
    document.getElementById('users-count').textContent = state.totalUsers ?? '—';
  }

  function renderLimited(container, items, visible, renderer, emptyText, moreKey) {
    if (!items.length) {
      container.innerHTML = `<div class="api-empty-state">${emptyText}</div>`;
      return;
    }

    const shown = items.slice(0, visible);
    container.innerHTML = shown.map(renderer).join('');

    if (items.length > shown.length) {
      container.insertAdjacentHTML('beforeend', `
        <div class="load-more-wrap">
          <button class="load-more-btn" type="button" data-friends-more="${moreKey}">Ver mais</button>
        </div>
      `);
    }
  }

  function renderFriends() {
    const filteredFriends = state.friends.filter(matchesSearch);
    renderLimited(
      friendsContainer,
      filteredFriends,
      state.friendsVisible,
      (friend) => friendCard(
        friend,
        `<button type="button" class="friend-card-btn remove-friend-btn" onclick="removeFriend('${escapeHTML(friend.nickname)}')">Remover amizade</button>`,
        'Amigo'
      ),
      'Você ainda não tem amigos adicionados.',
      'mine'
    );
  }

  function renderExplore() {
    const friendNicknames = new Set(state.friends.map((friend) => friend.nickname).filter(Boolean));
    const sentNicknames = new Set(state.sent.map((req) => req.receiver?.nickname).filter(Boolean));
    const filteredExplore = state.explore
      .filter((user) => user.nickname && !friendNicknames.has(user.nickname))
      .filter(matchesSearch);

    renderLimited(
      exploreContainer,
      filteredExplore,
      state.exploreVisible,
      (user) => friendCard(
        user,
        sentNicknames.has(user.nickname)
          ? '<span class="friend-status-pill">Solicitação enviada</span>'
          : `<button type="button" class="community-card-btn" onclick="sendFriendRequest('${escapeHTML(user.nickname)}')">Adicionar</button>`,
        'Aluno'
      ),
      state.query ? 'Nenhum usuário encontrado para a busca.' : 'Digite um nickname para encontrar alunos ou enviar uma solicitação.',
      'explore'
    );
  }

  function renderRequests() {
    requestsReceivedTab?.classList.toggle('active', state.requestMode === 'received');
    requestsSentTab?.classList.toggle('active', state.requestMode === 'sent');

    receivedContainer.classList.toggle('d-none', state.requestMode !== 'received');
    sentContainer.classList.toggle('d-none', state.requestMode !== 'sent');

    if (!state.received.length) {
      receivedContainer.innerHTML = '<div class="api-empty-state">Nenhuma solicitação recebida.</div>';
    } else {
      receivedContainer.innerHTML = state.received.map((req) => friendCard(
        req.sender,
        `<div class="d-flex gap-2 mt-2 flex-wrap">
          <button type="button" class="friend-card-btn" onclick="acceptFriend('${escapeHTML(req.sender.nickname)}')">Aceitar</button>
          <button type="button" class="friend-card-btn cancel-request-btn" onclick="rejectFriend('${escapeHTML(req.sender.nickname)}')">Recusar</button>
        </div>`,
        'Recebida'
      )).join('');
    }

    if (!state.sent.length) {
      sentContainer.innerHTML = '<div class="api-empty-state">Nenhuma solicitação enviada.</div>';
    } else {
      sentContainer.innerHTML = state.sent.map((req) => friendCard(
        req.receiver,
        `<button type="button" class="friend-card-btn cancel-request-btn" onclick="cancelRequest('${escapeHTML(req.receiver.nickname)}')">Cancelar pedido</button>`,
        'Enviada'
      )).join('');
    }
  }

  function renderAll() {
    setStatusCounts();
    renderFriends();
    renderExplore();
    renderRequests();
  }

  async function loadFriends() {
    const data = await apiJSON('/api/users/friends/');
    state.friends = normalizeList(data, 'friends');
  }

  async function loadReceivedRequests() {
    const data = await apiJSON('/api/users/friend-requests/received/');
    state.received = normalizeList(data, 'requests');
  }

  async function loadSentRequests() {
    const data = await apiJSON('/api/users/friend-requests/sent/');
    state.sent = normalizeList(data, 'requests');
  }

  async function loadExploreUsers(query = '') {
    const encoded = encodeURIComponent(query);
    try {
      const data = await tryApiJSON([
        `/api/users/search/?q=${encoded}`,
        `/api/users/?search=${encoded}`,
        `/api/users/all/?search=${encoded}`,
      ]);
      const users = normalizeList(data, 'users');
      const me = getLoggedUserFromStorage();
      state.explore = users.filter((user) => !isSameUser(user, me));
      state.totalUsers = data.total_users ?? data.users_count ?? data.count ?? (users.length || state.totalUsers);
    } catch (error) {
      // Se a API não tiver listagem pública de usuários, a página continua útil pelo envio por nickname.
      if (query) state.explore = [];
      state.totalUsers = state.totalUsers ?? null;
    }
  }

  async function refreshAll() {
    try {
      await Promise.all([loadFriends(), loadReceivedRequests(), loadSentRequests(), loadExploreUsers(state.query)]);
      renderAll();
    } catch (error) {
      console.error(error);
      friendsContainer.innerHTML = '<div class="api-empty-state text-danger">Erro ao carregar amizades.</div>';
    }
  }

  let searchTimer = null;
  searchInput?.addEventListener('input', () => {
    state.query = searchInput.value.trim().toLowerCase();
    state.friendsVisible = 4;
    state.exploreVisible = 4;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      await loadExploreUsers(state.query);
      renderAll();
    }, 350);
  });

  document.addEventListener('click', (event) => {
    const moreButton = event.target.closest('[data-friends-more]');
    if (!moreButton) return;
    if (moreButton.dataset.friendsMore === 'mine') state.friendsVisible += 4;
    if (moreButton.dataset.friendsMore === 'explore') state.exploreVisible += 4;
    renderAll();
  });

  requestsReceivedTab?.addEventListener('click', () => {
    state.requestMode = 'received';
    renderRequests();
  });

  requestsSentTab?.addEventListener('click', () => {
    state.requestMode = 'sent';
    renderRequests();
  });

  window.sendFriendRequest = async function sendFriendRequest(nicknameArg = '') {
    const nickname = (nicknameArg || searchInput?.value || '').trim();
    friendError.style.display = 'none';
    friendSuccess.style.display = 'none';

    if (!nickname) {
      friendError.textContent = 'Digite um nickname válido.';
      friendError.style.display = 'block';
      return;
    }

    try {
      await apiJSON(`/api/users/friend-request/${encodeURIComponent(nickname)}/send/`, { method: 'POST' });
      friendSuccess.textContent = 'Solicitação enviada com sucesso!';
      friendSuccess.style.display = 'block';
      if (!nicknameArg && searchInput) searchInput.value = '';
      state.query = '';
      await refreshAll();
    } catch (e) {
      friendError.textContent = e.message || 'Erro ao enviar solicitação.';
      friendError.style.display = 'block';
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
