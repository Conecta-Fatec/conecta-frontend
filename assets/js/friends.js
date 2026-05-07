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
  const addInput = document.getElementById('targetNickname');
  const searchInput = document.getElementById('friendSearch');
  const friendError = document.getElementById('friendError');
  const friendSuccess = document.getElementById('friendSuccess');
  const requestsReceivedTab = document.getElementById('requests-received-tab');
  const requestsSentTab = document.getElementById('requests-sent-tab');

  const addFriendModal = document.getElementById('addFriendModal');

  addFriendModal?.addEventListener('show.bs.modal', () => {
    if (addInput) addInput.value = '';

    if (friendError) {
      friendError.textContent = '';
      friendError.style.display = 'none';
    }

    if (friendSuccess) {
      friendSuccess.textContent = '';
      friendSuccess.style.display = 'none';
    }

    setTimeout(() => addInput?.focus(), 180);
  });

  const state = {
    friends: [],
    explore: [],
    received: [],
    sent: [],
    query: '',
    friendsVisible: 3,
    exploreVisible: 3,
    totalUsers: null,
    requestMode: 'received',
  };

  function normalizeList(data, key) {
    if (Array.isArray(data)) return data;
    return data?.[key] || data?.results || data?.items || data?.users || [];
  }

  function isSameUser(a = {}, b = {}) {
    const first = userProfileSource(a);
    const second = userProfileSource(b);

    return Boolean(
      (first.id && second.id && Number(first.id) === Number(second.id)) ||
      (first.nickname && second.nickname && first.nickname === second.nickname)
    );
  }

  function userCardContent(user = {}, actionHTML = '', tag = '') {
    const source = userProfileSource(user);
    const name = userDisplayName(source);
    const nickname = source.nickname || source.username || 'usuario';

    return `
      ${avatarHTML(source, 'friend-card-avatar')}

      <div class="friend-card-body community-card-body">
        ${tag ? `<span class="community-card-tag">${tag}</span>` : ''}

        <h3 class="friend-card-name">${escapeHTML(name)}</h3>

        <span class="nickname-text">@${escapeHTML(nickname)}</span>

        ${source.course ? `<p class="friend-card-course">${escapeHTML(source.course)}</p>` : ''}

        ${actionHTML}
      </div>
    `;
  }

  function friendCard(user = {}) {
    return `
      <a href="${profileUrlFor(user)}" class="friend-card community-card friend-card-link-card" aria-label="Abrir perfil de ${escapeHTML(userDisplayName(user))}">
        ${userCardContent(user, '<span class="friend-text-link">Ver perfil</span>')}
      </a>
    `;
  }

  function clickableProfileCardAttrs(user = {}) {
    return `data-profile-href="${profileUrlFor(user)}" role="link" tabindex="0" aria-label="Abrir perfil de ${escapeHTML(userDisplayName(user))}"`;
  }

  function exploreCard(user = {}) {
    const source = userProfileSource(user);
    const nickname = source.nickname || source.username || '';
    const sentNicknames = new Set(state.sent.map((req) => userProfileSource(req.receiver || req).nickname).filter(Boolean));
    const isSent = sentNicknames.has(nickname);

    return `
      <article class="friend-card community-card friend-card-link-card" ${clickableProfileCardAttrs(source)}>
        ${userCardContent(
          source,
          isSent
            ? '<span class="friend-status-pill">Solicitação enviada</span>'
            : `<button type="button" class="community-card-btn" onclick="sendFriendRequest('${escapeHTML(nickname)}')">Adicionar</button>`,
          'Aluno'
        )}
      </article>
    `;
  }

  function requestCard(user = {}, type = 'received') {
    const source = userProfileSource(user);
    const nickname = source.nickname || source.username || '';
    const actions = type === 'received'
      ? `
        <div class="request-actions">
          <button type="button" class="friend-card-btn" onclick="acceptFriend('${escapeHTML(nickname)}')">Aceitar</button>
          <button type="button" class="friend-card-btn cancel-request-btn" onclick="rejectFriend('${escapeHTML(nickname)}')">Recusar</button>
        </div>
      `
      : `
        <div class="request-actions">
          <button type="button" class="friend-card-btn cancel-request-btn" onclick="cancelRequest('${escapeHTML(nickname)}')">Cancelar</button>
        </div>
      `;

    return `
      <article class="friend-card community-card friend-card-link-card request-card" ${clickableProfileCardAttrs(source)}>
        ${userCardContent(source, actions, type === 'received' ? 'Recebida' : 'Enviada')}
      </article>
    `;
  }

  function matchesSearch(user = {}) {
    if (!state.query) return true;

    const source = userProfileSource(user);
    const haystack = `${source.full_name || ''} ${source.name || ''} ${source.first_name || ''} ${source.last_name || ''} ${source.nickname || ''} ${source.username || ''} ${source.course || ''}`.toLowerCase();
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
      friendCard,
      'Você ainda não tem amigos adicionados.',
      'mine'
    );
  }

  function renderExplore() {
    const friendNicknames = new Set(state.friends.map((friend) => userProfileSource(friend).nickname).filter(Boolean));
    const filteredExplore = state.explore
      .filter((user) => {
        const nickname = userProfileSource(user).nickname;
        return nickname && !friendNicknames.has(nickname);
      })
      .filter(matchesSearch);

    renderLimited(
      exploreContainer,
      filteredExplore,
      state.exploreVisible,
      exploreCard,
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
      receivedContainer.innerHTML = state.received
        .map((req) => requestCard(req.sender, 'received'))
        .join('');
    }

    if (!state.sent.length) {
      sentContainer.innerHTML = '<div class="api-empty-state">Nenhuma solicitação enviada.</div>';
    } else {
      sentContainer.innerHTML = state.sent
        .map((req) => requestCard(req.receiver, 'sent'))
        .join('');
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
      if (query) state.explore = [];
      state.totalUsers = state.totalUsers ?? null;
    }
  }

  async function refreshAll() {
    try {
      await Promise.all([
        loadFriends(),
        loadReceivedRequests(),
        loadSentRequests(),
        loadExploreUsers(state.query),
      ]);

      renderAll();
    } catch (error) {
      console.error(error);
      friendsContainer.innerHTML = '<div class="api-empty-state text-danger">Erro ao carregar amizades.</div>';
    }
  }

  let searchTimer = null;

  searchInput?.addEventListener('input', () => {
    state.query = searchInput.value.trim().toLowerCase();
    state.friendsVisible = 3;
    state.exploreVisible = 3;

    clearTimeout(searchTimer);

    searchTimer = setTimeout(async () => {
      await loadExploreUsers(state.query);
      renderAll();
    }, 350);
  });

  document.addEventListener('click', (event) => {
    const interactiveChild = event.target.closest('button, a, input, textarea, select, label');
    const profileCard = event.target.closest('[data-profile-href]');

    if (profileCard && !interactiveChild) {
      window.location.href = profileCard.dataset.profileHref;
      return;
    }

    const moreButton = event.target.closest('[data-friends-more]');

    if (!moreButton) return;

    if (moreButton.dataset.friendsMore === 'mine') state.friendsVisible += 3;
    if (moreButton.dataset.friendsMore === 'explore') state.exploreVisible += 3;

    renderAll();
  });

  document.addEventListener('keydown', (event) => {
    if (!['Enter', ' '].includes(event.key)) return;
    if (event.target.closest('button, a, input, textarea, select, label')) return;

    const profileCard = event.target.closest('[data-profile-href]');
    if (!profileCard) return;

    event.preventDefault();
    window.location.href = profileCard.dataset.profileHref;
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
    const nickname = (nicknameArg || addInput?.value || searchInput?.value || '').trim();

    friendError.style.display = 'none';
    friendSuccess.style.display = 'none';

    if (!nickname) {
      friendError.textContent = 'Informe um nickname para enviar a solicitação.';
      friendError.style.display = 'block';
      return;
    }

    try {
      const response = await apiFetch(`/api/users/friend-request/${encodeURIComponent(nickname)}/send/`, {
        method: 'POST',
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        friendError.textContent = getApiError(data, 'Erro ao enviar solicitação.');
        friendError.style.display = 'block';
        return;
      }

      friendSuccess.textContent = 'Solicitação enviada com sucesso.';
      friendSuccess.style.display = 'block';

      if (addInput) addInput.value = '';

      await refreshAll();

      const modalEl = document.getElementById('addFriendModal');
      if (modalEl) {
        setTimeout(() => {
          bootstrap.Modal.getOrCreateInstance(modalEl).hide();
        }, 650);
      }
      
    } catch (error) {
      console.error(error);
      friendError.textContent = 'Erro de conexão com o servidor.';
      friendError.style.display = 'block';
    }
  };

  window.removeFriend = async function removeFriend(nickname) {
    if (!confirm(`Remover @${nickname} da sua lista de amizades?`)) return;

    try {
      const response = await apiFetch(`/api/users/friend/${encodeURIComponent(nickname)}/remove/`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        alert(getApiError(data, 'Erro ao remover amizade.'));
        return;
      }

      await refreshAll();
    } catch (error) {
      console.error(error);
      alert('Erro de conexão com o servidor.');
    }
  };

  window.acceptFriend = async function acceptFriend(nickname) {
    try {
      const response = await apiFetch(`/api/users/friend-request/${encodeURIComponent(nickname)}/accept/`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        alert(getApiError(data, 'Erro ao aceitar solicitação.'));
        return;
      }

      await refreshAll();
    } catch (error) {
      console.error(error);
      alert('Erro de conexão com o servidor.');
    }
  };

  window.rejectFriend = async function rejectFriend(nickname) {
    try {
      const response = await apiFetch(`/api/users/friend-request/${encodeURIComponent(nickname)}/reject/`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        alert(getApiError(data, 'Erro ao recusar solicitação.'));
        return;
      }

      await refreshAll();
    } catch (error) {
      console.error(error);
      alert('Erro de conexão com o servidor.');
    }
  };

  window.cancelRequest = async function cancelRequest(nickname) {
    try {
      const response = await apiFetch(`/api/users/friend-request/${encodeURIComponent(nickname)}/cancel/`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        alert(getApiError(data, 'Erro ao cancelar solicitação.'));
        return;
      }

      await refreshAll();
    } catch (error) {
      console.error(error);
      alert('Erro de conexão com o servidor.');
    }
  };

  await refreshAll();
});
